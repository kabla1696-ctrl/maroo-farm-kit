# Maroo Airdrop Farming — Full Task List

> No confirmed Maroo airdrop / points program as of 2026-10-06.
> Below is footprint-maximization based on `docs.maroo.io` + 32 MCP tools.
> No guarantee of allocation. Do NOT sybil.

Kit: `@maroo-chain/agent-wallet-kit 0.2.1`
- `m-aws 0.2.10` — 20 tools: `agent.*` (11) / `policy.*` (3) / `transfer.*` (5) / `faucet.*` (1)
- `maroo-mcp 0.1.3` — 12 tools: knowledge (3) / walletChain (4) / complianceTx (5)
- Chain: Maroo testnet, chainId `450815`, gas in OKRW/tOKRW
- URLs: faucet `https://faucet.maroo.io`, explorer `https://explorer-testnet.maroo.io`, experience `https://experience.maroo.io`, agent hub `https://agent.maroo.io`, docs `https://docs.maroo.io`

This repo already wires (same as `agent-wallet-kit init`, project scope):
- `.mcp.json` — Claude Code project
- `.cursor/mcp.json` — Cursor project
- `.gemini/settings.json` — Gemini CLI project

## 0. Login (BLOCKER — tumi korba)

```cmd
cmd /c m-aws login kakao
:: or: google / email
cmd /c m-aws status
cmd /c m-aws doctor
cmd /c maroo-mcp doctor
```

## 1. Mandatory on-chain (probable snapshot signals)

1. `cmd /c m-aws drip` — 5,000 tOKRW. Cap 10,000/wallet. 5 success / 10min / IP.
2. Agent create: MCP `agent.create` (PAYMASTER) -> `agent.detail` ACTIVE (~1-3 min) -> `agent.list`
3. Fund: `agent.fund` owner->agent -> `agent.balance` + `agent.owner_balance`
4. Policy: `policy.set` limit + allowed targets -> `policy.get` -> `policy.preflight` (pass + fail case)
5. Send: `policy.preflight` -> `transfer.send` small amount
6. Gas modes: `agent.set_gas_source` PAYMASTER -> SELF -> PAYMASTER
7. Freeze cycle: `agent.freeze` -> `agent.unfreeze`
8. Drain: `agent.drain` partial (`maxAmount`) -> full
9. Ownership: `transfer.initiate` -> `transfer.pending` -> `transfer.accept` / `transfer.cancel` (2nd account needed)
10. Explorer verify every tx on `explorer-testnet.maroo.io`
11. `experience.maroo.io` interactive demo complete koro

## 2. Read-only (login lage na, MCP client theke)

`discover`, `kb_search`, `kb_lookup`, `wallet_create`, `wallet_import`, `balance`, `chain_info`, `preflight`, `pcl_check`, `pcl_limits`, `send`, `tx_status`

## 3. Secret / extra boost (speculation)

- Daily consistency 3-4 week, 1 din e sob na
- 2-3 agent different purpose + different policy limit
- Pass + reject preflight both test koro
- `clientToken` idempotency test (same token replay)
- Error paths: `AGENT_PENDING`, `POLICY_REJECTED`, `FAUCET_RATE_LIMITED`, `INSUFFICIENT_BALANCE`
- `m-aws tui`, `m-aws update`, `m-aws version` usage
- GitHub: star/watch + issue/bug report `hashed-open-finance/m-aws`
- Multi-client: same project Cursor + Gemini + Claude Code e open koro
- Manual ethers/viem tx (`docs.maroo.io/guides/quickstart/sending-okrw`)

## 4. Daily loop (after login)

```
m-aws status
m-aws drip --json
agent.list -> agent.detail (each)
agent.owner_balance
policy.get (each agent)
policy.preflight (1 pass + 1 fail)
transfer.send (small)
explorer check
```

## 5. Safety

- `agent.revoke` IRREVERSIBLE — only test agent e
- Mainnet e test key reuse koro na
- `WAAS_AUTH_TOKEN` commit koro na
- Faucet abuse / multi-wallet sybil = ban risk
