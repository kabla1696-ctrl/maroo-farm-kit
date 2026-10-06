// farm-config.js — loads account addresses from gitignored config.local.json
// (or env: MAROO_OWNER, MAROO_BOT1...). Never commit real addresses.
import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./config.local.json', import.meta.url);
const file = existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : {};
export const OWNER = process.env.MAROO_OWNER ?? file.OWNER ?? '';
export const BOT1 = process.env.MAROO_BOT1 ?? file.BOT1 ?? '';
export const BOT1_ADDR = process.env.MAROO_BOT1_ADDR ?? file.BOT1_ADDR ?? '';
export const BOT2 = process.env.MAROO_BOT2 ?? file.BOT2 ?? '';
export const BOT2_ADDR = process.env.MAROO_BOT2_ADDR ?? file.BOT2_ADDR ?? '';
