// policy-guard.js — defense layer for value-moving calls (audit #16-21).
// Guards: (1) re-reads on-chain policy right before send (TOCTOU/fail-open),
// (2) refuses "unlimited" policies unless explicitly allowed (0-footgun),
// (3) validates amount>0 and target allowlist locally,
// (4) binds idempotency token to hash(tool+args) so token reuse across
//     different args can't replay stale results (audit #20).
// Usage: import { guardedSend } from './policy-guard.js'
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const BIN = 'C:\\Users\\Nishis PC\\AppData\\Roaming\\npm\\node_modules\\@maroo-chain\\agent-wallet-kit\\dist\\bin\\m-aws.js';

function call(tool, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['--unhandled-rejections=warn', BIN, 'serve'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', id = 0; const pend = new Map();
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 90000);
    child.stdout.on('data', (d) => {
      buf += d.toString(); let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const m = JSON.parse(line);
          if (m.id !== undefined && pend.has(m.id)) {
            const f = pend.get(m.id); pend.delete(m.id);
            if (m.error) f(Promise.reject(new Error(JSON.stringify(m.error))));
            else f(m.result);
          }
        } catch {}
      }
    });
    child.stderr.on('data', () => {});
    const req = (method, params) => new Promise((res) => {
      const i = ++id; pend.set(i, res);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n');
    });
    (async () => {
      try {
        await req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'policy-guard', version: '1.0' } });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        const r = await req('tools/call', { name: tool, arguments: args });
        clearTimeout(timer); child.kill();
        resolve(JSON.parse(r.content[0].text));
      } catch (e) { clearTimeout(timer); child.kill(); reject(e); }
    })();
  });
}

const boundToken = (tool, args, tag) => {
  const h = createHash('sha256').update(tool + ':' + JSON.stringify(args)).digest('hex').slice(0, 16);
  return `guard-${tag}-${h}`;
};

export async function guardedSend({ agentId, amount, to, tag = 'x', allowUnlimited = false }) {
  // 1. Fresh on-chain policy (not cached, not preflight-only)
  const pol = await call('policy.get', { agentId });
  if (!pol.ok) return { refused: true, reason: 'policy unreadable (fail-closed): ' + JSON.stringify(pol).slice(0, 160) };
  const limitStr = pol.data?.spendingLimitOKRW;
  const targets = pol.data?.allowedTargets ?? [];
  // 2. Unlimited footgun guard ("0" == unlimited)
  if ((limitStr === 'unlimited' || limitStr === undefined) && !allowUnlimited) {
    return { refused: true, reason: `policy is UNLIMITED (limit=${limitStr}); pass allowUnlimited:true to override` };
  }
  // 3. Local amount/target validation
  const amt = Number(amount);
  if (!(amt > 0)) return { refused: true, reason: `amount must be > 0 (got ${amount})` };
  if (limitStr !== 'unlimited' && amt > Number(limitStr)) {
    return { refused: true, reason: `amount ${amount} exceeds limit ${limitStr}` };
  }
  if (targets.length > 0 && !targets.map((t) => t.toLowerCase()).includes(to.toLowerCase())) {
    return { refused: true, reason: `target not in allowlist (${targets.length} entries)` };
  }
  // 4. Server preflight must agree
  const pre = await call('policy.preflight', { agentId, amount: String(amount), to, clientToken: boundToken('policy.preflight', { agentId, amount, to }, tag) });
  if (!pre.ok || !pre.data?.canTransact) {
    return { refused: true, reason: 'preflight denies: ' + JSON.stringify(pre).slice(0, 200) };
  }
  // 5. Send with arg-bound token
  const args = { agentId, amount: String(amount), to, clientToken: boundToken('transfer.send', { agentId, amount, to }, tag) };
  return call('transfer.send', args);
}
