# Audit (public) — @maroo-chain stack, 2026-10-06

Windows-compat + reliability findings safe to share. Critical auth issues
(RCE, login-fixation, token perms) were disclosed PRIVATELY to the vendor
and are intentionally omitted here until fixed.

## Windows blindspot (verified live, win-check 3/6 FAIL)
- ExecutionPolicy Restricted blocks `npm` shims for new users
- `HOME` unset breaks keystore path + init display
- Claude Desktop config path macOS-hardcoded (Windows skipped)
- `m-aws serve` crashes on Node24 (vendored analytics, no .catch) — workaround in `scripts/mcp-call.js`
- `.cmd` shims don't resolve in shell-less spawn

## Faucet / chain (verified live)
- Faucet distributor `executeBatch` reverts on-chain (API alive) — `ISSUE-DRAFT-faucet.md`
- PCL precompile `globalOkrwEasPeriodicVolume` reverts chain-wide (`0xcc49c7b1`)

## Reliability (safe subset)
- Legacy/new `maroo_send` dual handlers (legacy bypasses all safety; safe handler active in 0.1.3 — verified via `safe-send --detect`)
- Doctor reports down services as warn/exit-0; RPC URL divergence between packages
- Faucet quota untouched on failure; rate-limit windows observed

Full 40-finding report publishes after vendor confirms critical fixes.
