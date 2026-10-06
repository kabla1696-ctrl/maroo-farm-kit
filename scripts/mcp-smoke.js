// mcp-smoke.js — CI regression for serve-startup crashes (audit #10).
// Exits 0 only if the server survives startup and lists >= min tools.
// Run: node scripts/mcp-smoke.js [m-aws|maroo-mcp] [minTools]
// NOTE: m-aws on Node24 currently needs the analytics workaround, so CI runs
// it with --unhandled-rejections=warn (documents the bug); strict is used
// for maroo-mcp. Flip m-aws to strict once upstream fixes agentkit analytics.
import { spawn } from 'node:child_process';
const KIT = 'C:\\Users\\Nishis PC\\AppData\\Roaming\\npm\\node_modules\\@maroo-chain\\agent-wallet-kit\\dist\\bin';
const BINS = { 'm-aws': `${KIT}\\m-aws.js`, 'maroo-mcp': `${KIT}\\maroo-mcp.js` };
const bin = process.argv[2] ?? 'maroo-mcp';
const minTools = Number(process.argv[3] ?? (bin === 'm-aws' ? 20 : 12));
const mode = bin === 'm-aws' ? 'warn' : 'strict';
if (!BINS[bin]) { console.error('unknown bin'); process.exit(2); }
const child = spawn('node', [`--unhandled-rejections=${mode}`, BINS[bin], 'serve'], {
  stdio: ['pipe', 'pipe', 'pipe'], // no shell: argv exact (shell:true breaks node bin resolution)
});
let buf = '', errBuf = '';
child.stderr.on('data', (d) => { errBuf += d.toString(); });
child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const m = JSON.parse(line);
      if (m.id === 2 && m.result?.tools) {
        clearTimeout(timer);
        const n = m.result.tools.length;
        console.log(n >= minTools ? `SMOKE PASS: ${n} tools` : `SMOKE FAIL: only ${n} tools`);
        child.kill();
        process.exit(n >= minTools ? 0 : 1);
      }
    } catch {}
  }
});
const send = (o) => child.stdin.write(JSON.stringify(o) + '\n');
const timeoutMs = bin === 'm-aws' ? 120000 : 45000; // m-aws startup slow (agentkit load + hanging analytics fetch)
const timer = setTimeout(() => { console.error('SMOKE FAIL: timeout'); child.kill(); process.exit(1); }, timeoutMs);
child.on('exit', (code) => {
  // Server died before answering tools/list = crash regression caught.
  clearTimeout(timer);
  console.error(`SMOKE FAIL: server exited=${code} before tools/list\nSTDOUT:\n` + buf.slice(-800) + `\nSTDERR:\n` + errBuf.slice(-1200));
  process.exit(1);
});
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'ci', version: '0' } } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
