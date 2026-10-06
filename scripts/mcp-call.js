// Minimal MCP stdio client for m-aws / maroo-mcp servers.
// Usage: node mcp-call.js <serverCmd> <toolName> '<jsonArgs>'
// Example: node mcp-call.js m-aws agent.list '{}'
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BINS = {
  'm-aws': 'C:\\Users\\Nishis PC\\AppData\\Roaming\\npm\\node_modules\\@maroo-chain\\agent-wallet-kit\\dist\\bin\\m-aws.js',
  'maroo-mcp': 'C:\\Users\\Nishis PC\\AppData\\Roaming\\npm\\node_modules\\@maroo-chain\\agent-wallet-kit\\dist\\bin\\maroo-mcp.js',
  'agent-wallet-kit': 'C:\\Users\\Nishis PC\\AppData\\Roaming\\npm\\node_modules\\@maroo-chain\\agent-wallet-kit\\dist\\bin\\agent-wallet-kit.js',
};

const [serverCmd, toolName, argsJson = '{}'] = process.argv.slice(2);
if (!serverCmd || !toolName || !BINS[serverCmd]) {
  console.error('Usage: node mcp-call.js <m-aws|maroo-mcp> <tool|__list> \'<jsonArgs>\'');
  process.exit(2);
}

// NOTE: --unhandled-rejections=warn works around an upstream bug where the
// vendored @coinbase/agentkit analytics (fire-and-forget fetch to
// cca-lite.coinbase.com, no .catch) kills `m-aws serve` on Node 24 when the
// endpoint answers 400. Warnings instead of crash.
const child = spawn(
  'node',
  ['--unhandled-rejections=warn', BINS[serverCmd], 'serve'],
  { stdio: ['pipe', 'pipe', 'pipe'] },
);
let buf = '';
let nextId = 1;
const pending = new Map();

function send(msg) {
  child.stdin.write(JSON.stringify(msg) + '\n');
}
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ jsonrpc: '2.0', id, method, params });
  });
}

child.stdout.on('data', (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }
});

const errBuf = [];
child.stderr.on('data', (d) => { errBuf.push(d.toString()); }); // server logs
child.on('error', (e) => { console.error('SPAWN_FAIL ' + e.message); process.exit(1); });

// safety timeout
const timer = setTimeout(() => {
  console.error('TIMEOUT waiting for server. STDERR tail:\n' + errBuf.join('').slice(-2000));
  child.kill();
  process.exit(1);
}, 60000);

try {
  await request('initialize', {
    protocolVersion: '2024-11-05', capabilities: {},
    clientInfo: { name: 'maroo-farm', version: '1.0' },
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  if (toolName === '__list') {
    const res = await request('tools/list', {});
    console.log(JSON.stringify(res.tools.map((t) => t.name)));
  } else {
    let argStr = argsJson;
    if (argStr.startsWith('@')) argStr = readFileSync(argStr.slice(1), 'utf-8');
    const res = await request('tools/call', {
      name: toolName, arguments: JSON.parse(argStr),
    });
    console.log(JSON.stringify(res, null, 2));
  }
  clearTimeout(timer);
  child.kill();
  process.exit(0);
} catch (e) {
  console.error('CALL_FAIL ' + e.message);
  child.kill();
  process.exit(1);
}
