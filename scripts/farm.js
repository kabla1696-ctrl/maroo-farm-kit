// maroo-farm-kit v1 — testnet farming CLI (READ-ONLY safe by default).
// Commands:
//   node farm.js status    — owner + agents + balances snapshot
//   node farm.js report    — writes REPORT.md (airdrop proof)
//   node farm.js drip-watch [--rounds N] [--waitMs X] — faucet retry loop w/ backoff
// Fund-gated lifecycle (fund/send/drain) stays manual via scripts/mcp-call.js until balance > 0.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BIN = 'C:\\Users\\Nishis PC\\AppData\\Roaming\\npm\\node_modules\\@maroo-chain\\agent-wallet-kit\\dist\\bin\\m-aws.js';
const MCP = 'C:\\Users\\Nishis PC\\AppData\\Roaming\\npm\\node_modules\\@maroo-chain\\agent-wallet-kit\\dist\\bin\\maroo-mcp.js';

function mcp(bin, method, params) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['--unhandled-rejections=warn', bin, 'serve'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', id = 0;
    const pending = new Map();
    const send = (m) => child.stdin.write(JSON.stringify(m) + '\n');
    const req = (method, params) => new Promise((res, rej) => {
      const i = ++id; pending.set(i, { res, rej }); send({ jsonrpc: '2.0', id: i, method, params });
    });
    const timer = setTimeout(() => { child.kill(); reject(new Error('mcp timeout')); }, 90000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pending.has(msg.id)) {
            const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
            msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
          }
        } catch {}
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    (async () => {
      try {
        await req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'farm-kit', version: '1.0' } });
        send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const out = method === '__raw__' ? params : await req('tools/call', { name: method, arguments: params });
        clearTimeout(timer); child.kill();
        resolve(out);
      } catch (e) { clearTimeout(timer); child.kill(); reject(e); }
    })();
  });
}

const tool = (t, a = {}) => mcp(BIN, t, a).then((r) => JSON.parse(r.content[0].text));
const mtool = (t, a = {}) => mcp(MCP, t, a).then((r) => JSON.parse(r.content[0].text.replace(/^\n/, '')) || r);

const cmd = process.argv[2];

if (cmd === 'status') {
  const owner = await tool('agent.owner_balance').catch((e) => ({ error: String(e) }));
  const agents = await tool('agent.list').catch((e) => ({ error: String(e) }));
  const chain = await mtool('maroo_chain_info').catch((e) => ({ error: String(e) }));
  console.log(JSON.stringify({ owner, agents, blockHeight: chain?.data?.blockHeight ?? chain }, null, 2));
} else if (cmd === 'report') {
  const owner = await tool('agent.owner_balance').catch(() => ({}));
  const agents = await tool('agent.list').catch(() => []);
  const rows = [];
  const list = agents?.data ?? [];
  for (const a of list) {
    const d = await tool('agent.detail', { agentId: a.id ?? a.agentId }).catch(() => ({}));
    rows.push(d?.data ?? a);
  }
  const md = `# Farm Report — ${new Date().toISOString()}\n\nOwner: ${owner?.data?.address} balance=${owner?.data?.balance} OKRW\n\n` +
    rows.map((r) => `- ${r.name} ${r.address} status=${r.status} onchainId=${r.onchainAgentId} balance=${r.balance}`).join('\n') + '\n';
  writeFileSync('REPORT.md', md);
  console.log(md);
} else if (cmd === 'drip-watch') {
  const rounds = Number(process.argv.find((a) => a.startsWith('--rounds='))?.split('=')[1] ?? 6);
  const waitMs = Number(process.argv.find((a) => a.startsWith('--waitMs='))?.split('=')[1] ?? 120000);
  for (let i = 1; i <= rounds; i++) {
    console.log(`[drip-watch] attempt ${i}/${rounds}`);
    try {
      const r = await tool('faucet.drip', {});
      console.log(JSON.stringify(r).slice(0, 500));
      if (r?.ok) { console.log('[drip-watch] FUNDED — stop'); break; }
    } catch (e) { console.log('[drip-watch] err ' + String(e).slice(0, 200)); }
    if (i < rounds) await new Promise((r) => setTimeout(r, waitMs));
  }
} else {
  console.log('Usage: node farm.js <status|report|drip-watch [--rounds=N] [--waitMs=ms]>');
}
