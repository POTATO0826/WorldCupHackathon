import type { ScoreEnvelope } from "@wc/shared-types";

/**
 * Deduplicate score envelopes by TxLINE event id — spec §9.7 rule 2.
 * Strategy: first-seen wins. Fixture 18209181 alone carries 413 duplicate ids.
 * Later frames with NEW ids still pass through and amend state downstream.
 */
export function dedupeScoreFrames(frames: ScoreEnvelope[]): {
  frames: ScoreEnvelope[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const out: ScoreEnvelope[] = [];
  let duplicates = 0;
  for (const f of frames) {
    const key = String(f.id);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    out.push(f);
  }
  return { frames: out, duplicates };
}
