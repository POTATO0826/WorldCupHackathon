import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
// src -> replay-engine -> apps -> repo root
const repoRoot = resolve(here, "../../..");

/**
 * Root folder holding one subfolder per TxLINE fixtureId. Overridable via
 * TXLINE_DATA_DIR so the same code runs against an extracted archive elsewhere.
 */
export const DATA_DIR =
  process.env.TXLINE_DATA_DIR ??
  join(repoRoot, "data", "exact-match-txline-raw-inspect", "txline-raw");

export function fixtureDir(fixtureId: string): string {
  return join(DATA_DIR, fixtureId);
}

export function scoresPath(fixtureId: string): string {
  return join(fixtureDir(fixtureId), "scores.ndjson");
}

export function oddsPath(fixtureId: string): string {
  return join(fixtureDir(fixtureId), "odds.ndjson");
}

export function hasHistorical(fixtureId: string): boolean {
  return existsSync(join(fixtureDir(fixtureId), "historical.raw.json"));
}
