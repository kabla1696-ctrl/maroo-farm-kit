# maroo-farm-kit

Community toolkit for farming the **Maroo testnet** (Hashed Open Finance L1, chainId `450815`) + field audit of the `@maroo-chain` agent stack. Testnet only. One account. No spam.

## Tools

| Script | What |
|---|---|
| `scripts/mcp-call.js` | MCP stdio client for `m-aws`/`maroo-mcp` (incl. Node24 analytics-crash workaround) |
| `scripts/farm.js` | `status` / `report` / `drip-watch` (quota-safe faucet retry) |
| `scripts/farm-daemon.js` | 30-min loop: monitor → auto fund-lifecycle on first funds → daily report |
| `scripts/faucet-doctor.js` | Faucet triage: RPC + API + execution isolation, JSONL history |
| `scripts/maroo-harden.js` | Lock secret-file perms, backup MCP configs |
| `scripts/policy-guard.js` | Pre-send safety: fresh policy re-read, unlimited/zero-guard, allowlist check, arg-bound idempotency |
| `scripts/safe-send.js` | Strict amount/address parser + maroo_send handler detector (`--detect` verifies safe handler active) |
| `scripts/win-check.js` | Windows-compat verifier (6 checks, exit-gated) |

## Quickstart (Windows)

```cmd
npm i -g @maroo-chain/agent-wallet-kit
m-aws login kakao
m-aws status
node scripts/win-check.js
node scripts/farm.js status
node scripts/farm-daemon.js --once
```

## Findings (see AUDIT.md)
- Faucet distributor reverts on-chain (backend alive) — `ISSUE-DRAFT-faucet.md`
- PCL precompile reverts chain-wide (`0xcc49c7b1`)
- 3 CRITICAL auth findings → disclose privately to `inquiry@hashedopenfinance.com`, NOT public issues

## Proof
`REPORT.md` (regenerated daily), `FARM-LOG.md` (full history).

## License
MIT.
