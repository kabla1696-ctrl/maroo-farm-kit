import { guardedSend } from './policy-guard.js';
import { BOT1, OWNER } from './farm-config.js';
// Case 1: over-limit must be REFUSED locally (no chain touch)
console.log('over-limit:', JSON.stringify(await guardedSend({ agentId: BOT1, amount: '100', to: OWNER, tag: 'test1' })).slice(0, 200));
// Case 2: legit 10 OKRW must PASS guard (send itself fails only on zero balance)
console.log('legit-10:', JSON.stringify(await guardedSend({ agentId: BOT1, amount: '10', to: OWNER, tag: 'test2' })).slice(0, 200));
