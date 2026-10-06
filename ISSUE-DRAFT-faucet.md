# DRAFT — file at https://github.com/hashed-open-finance/m-aws/issues

Title: `faucet.drip` always reverts: `executeBatch` failed on Maroo Testnet

Body:
- CLI: `@maroo-chain/m-aws 0.2.10` via `@maroo-chain/agent-wallet-kit 0.2.1`, Windows, Node 24
- `m-aws drip --json` and MCP `faucet.drip` (owner + agent addresses) all return:
  `FAUCET_FAILED ... executeBatch reverted ... status 400`
- `rateLimit.remaining` stays 4 (failures don't consume quota)
- Web faucet (faucet.maroo.io) also says "Network is congested"
- Diagnosis via probe (scripts/faucet-doctor.js): RPC healthy; API alive
  (OPTIONS 204, empty POST -> clean 400 "Invalid parameters");
  only funded execution reverts -> backend OK, distributor execution broken/empty
- `maroo_pcl_limits` / balance PCL read also reverts (`0xcc49c7b1` on `0x1000...0005`)
- Expected: 5,000 tOKRW drip to any fresh address (repro on multiple addresses)
