import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { ScoreEnvelope, OddsEnvelope } from "@wc/shared-types";

/**
 * Stream a (potentially large, up to ~20MB) ndjson file line by line.
 * Malformed lines are skipped rather than throwing — the raw feed occasionally
 * contains partial frames at capture boundaries.
 */
export async function* readNdjson(filePath: string): AsyncGenerator<unknown> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed);
    } catch {
      // skip malformed line
    }
  }
}

function isEnvelope(row: unknown): row is { id: unknown; data: Record<string, unknown> } {
  return (
    typeof row === "object" &&
    row !== null &&
    "data" in row &&
    typeof (row as { data: unknown }).data === "object" &&
    (row as { data: unknown }).data !== null
  );
}

/** Read + type all score envelopes from a fixture's scores.ndjson. */
export async function readScoreFrames(filePath: string): Promise<ScoreEnvelope[]> {
  const out: ScoreEnvelope[] = [];
  for await (const row of readNdjson(filePath)) {
    if (isEnvelope(row)) out.push(row as unknown as ScoreEnvelope);
  }
  return out;
}

/** Read + type all odds envelopes from a fixture's odds.ndjson. */
export async function readOddsFrames(filePath: string): Promise<OddsEnvelope[]> {
  const out: OddsEnvelope[] = [];
  for await (const row of readNdjson(filePath)) {
    if (isEnvelope(row)) out.push(row as unknown as OddsEnvelope);
  }
  return out;
}
