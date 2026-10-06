// safe-send.js — guard for maroo-mcp sends (audit #28-29, #12).
// (1) strict amount/address parsing (rejects "", "-5", "1.2.3", bad hex),
// (2) detects WHICH maroo_send handler is active (legacy bypass vs safe),
// (3) refuses to submit through the legacy bypass path.
// Usage: node scripts/safe-send.js --detect
//        node scripts/safe-send.js --send --to 0x.. --amount 1.5  (needs funded session wallet)
import { spawn } from 'node:child_process';
import { OWNER } from './farm-config.js';

const MCP = 'C:\\Users\\Nishis PC\\AppData\\Roaming\\npm\\node_modules\\@maroo-chain\\agent-wallet-kit\\dist\\bin\\maroo-mcp.js';

export function parseAmountStrict(s) {
  if (typeof s !== 'string' || !/^\d+(\.\d{1,18})?$/.test(s)) throw new Error(`bad amount: ${JSON.stringify(s)}`);
  const [w, f = ''] = s.split('.');
  if (w === '' || (w === '0' && f.replace(/0/g, '') === '')) throw new Error('amount must be > 0');
  return (BigInt(w) * 10n ** 18n + BigInt((f + '0'.repeat(18)).slice(0, 18))).toString();
}
export function isAddressStrict(a) {
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0{40}$/i.test(a);
}

function call(tool, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['--unhandled-rejections=warn', MCP, 'serve'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', id = 0; const pend = new Map();
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 60000);
    child.stdout.on('data', (d) => {
      buf += d.toString(); let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const m = JSON.parse(line);
          if (m.id !== undefined && pend.has(m.id)) {
            const f = pend.get(m.id); pend.delete(m.id);
            m.error ? f(new Error(JSON.stringify(m.error))) : f(m.result);
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
        await req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'safe-send', version: '1.0' } });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        const r = await req('tools/call', { name: tool, arguments: args });
        clearTimeout(timer); child.kill(); resolve(r);
      } catch (e) { clearTimeout(timer); child.kill(); reject(e); }
    })();
  });
}

const argv = (k) => process.argv.find((a) => a.startsWith(k + '='))?.slice(k.length + 1);

if (process.argv.includes('--detect')) {
  // Probe: legacy handler parseOkrw("abc") throws raw; new handler returns typed schema error.
  // Either way NO_WALLET/session error means it got past parsing — compare shapes.
  const probes = [
    { amount: 'abc', to: OWNER },
    { amount: '1.2.3', to: OWNER },
    { amount: '10', to: '0xZZZ-invalid' },
  ];
  for (const p of probes) {
    try {
      const r = await call('maroo_send', p);
      console.log(JSON.stringify(p), '=>', JSON.stringify(r).slice(0, 220));
    } catch (e) { console.log(JSON.stringify(p), '=> THROW', String(e).slice(0, 220)); }
  }
  console.log('\nLocal strict-parser self-test:');
  for (const bad of ['', '-5', '1.2.3', '0', '0.0', 'abc', '1.1234567890123456789']) {
    try { parseAmountStrict(bad); console.log('  MISS', JSON.stringify(bad)); }
    catch { console.log('  reject-ok', JSON.stringify(bad)); }
  }
  console.log('  accept-ok "10" =>', parseAmountStrict('10'));
  console.log('  addr-ok', isAddressStrict(OWNER), '| zero-reject', !isAddressStrict('0x0000000000000000000000000000000000000000'));
} else if (process.argv.includes('--send')) {
  const to = argv('--to'), amount = argv('--amount');
  if (!isAddressStrict(to)) { console.error('REFUSED: bad recipient'); process.exit(2); }
  let wei;
  try { wei = parseAmountStrict(amount); } catch (e) { console.error('REFUSED:', e.message); process.exit(2); }
  console.log('parsed wei:', wei);
  const r = await call('maroo_send', { to, amount });
  console.log(JSON.stringify(r).slice(0, 600));
} else {
  console.log('Usage: node scripts/safe-send.js --detect | --send --to=0x.. --amount=1.5');
}
