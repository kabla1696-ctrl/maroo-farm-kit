// faucet-doctor.js — Maroo testnet faucet health probe (no auth, no funds needed).
// Checks: RPC liveness, faucet API reachability+error signature, web faucet status,
// owner/agent balances. Appends timestamped JSONL to logs/faucet-health.jsonl
// Usage: node scripts/faucet-doctor.js [--probe-drip]
//   --probe-drip also fires one MCP faucet.drip (failures don't consume quota)
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { OWNER } from './farm-config.js';

const RPC = 'https://rpc-testnet.maroo.io';
const API = 'https://faucet.maroo.io/api/agent/sendToken';
const t0 = Date.now();
const rpc = async (method, params = []) => {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  return r.json();
};
const out = { ts: new Date().toISOString() };

// 1. RPC health
try {
  const b = await rpc('eth_blockNumber');
  out.rpc = { ok: true, block: parseInt(b.result, 16), latencyMs: Date.now() - t0 };
} catch (e) { out.rpc = { ok: false, error: String(e).slice(0, 150) }; }

// 2. Faucet API: OPTIONS probe (no funds, no quota)
try {
  const t = Date.now();
  const r = await fetch(API, { method: 'OPTIONS', signal: AbortSignal.timeout(15000) });
  out.faucetApi = { http: r.status, latencyMs: Date.now() - t, allow: r.headers.get('allow') };
} catch (e) { out.faucetApi = { reachable: false, error: String(e).slice(0, 150) }; }

// 3. Faucet API: empty POST (expect validation error, NOT revert — tells us if backend alive)
try {
  const t = Date.now();
  const r = await fetch(API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}), signal: AbortSignal.timeout(20000),
  });
  const body = await r.text();
  out.faucetApiEmptyPost = { http: r.status, latencyMs: Date.now() - t, body: body.slice(0, 300) };
} catch (e) { out.faucetApiEmptyPost = { error: String(e).slice(0, 150) }; }

// 4. Balances (diagnosis: is ANYONE funded?)
for (const [k, a] of [['owner', OWNER]]) {
  try {
    const b = await rpc('eth_getBalance', [a, 'latest']);
    out[k + 'Wei'] = BigInt(b.result).toString();
  } catch (e) { out[k + 'Wei'] = 'ERR'; }
}

// 5. Optional live drip probe (MCP, failures don't consume quota)
if (process.argv.includes('--probe-drip')) {
  const BIN = 'C:\\Users\\Nishis PC\\AppData\\Roaming\\npm\\node_modules\\@maroo-chain\\agent-wallet-kit\\dist\\bin\\m-aws.js';
  out.dripProbe = await new Promise((resolve) => {
    const c = spawn('node', ['--unhandled-rejections=warn', BIN, 'serve'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', id = 0; const pend = new Map();
    const timer = setTimeout(() => { c.kill(); resolve({ timeout: true }); }, 90000);
    c.stdout.on('data', (d) => {
      buf += d.toString(); let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const m = JSON.parse(line);
          if (m.id !== undefined && pend.has(m.id)) { const f = pend.get(m.id); pend.delete(m.id); f(m); }
        } catch {}
      }
    });
    c.stderr.on('data', () => {});
    const req = (method, params) => new Promise((res) => {
      const i = ++id; pend.set(i, res);
      c.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n');
    });
    (async () => {
      await req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'faucet-doctor', version: '1.0' } });
      c.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      const r = await req('tools/call', { name: 'faucet.drip', arguments: {} });
      clearTimeout(timer); c.kill();
      try { resolve(JSON.parse(r.content[0].text)); }
      catch { resolve({ raw: JSON.stringify(r).slice(0, 300) }); }
    })().catch((e) => { clearTimeout(timer); c.kill(); resolve({ error: String(e).slice(0, 150) }); });
  });
}

mkdirSync('logs', { recursive: true });
appendFileSync('logs/faucet-health.jsonl', JSON.stringify(out) + '\n');
console.log(JSON.stringify(out, null, 2));
