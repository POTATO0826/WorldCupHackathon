import type { FixtureMeta } from "./index.js";

/**
 * Static fixture catalogue — spec §5 ("Team display names are mapped from a
 * local fixture catalogue") and §9.2 (expected finals for settle fallback).
 *
 * The raw feed carries only numeric Participant*Id values, so display names
 * live here. The dataset README only names fixture 18209181 (FRA-MAR); the
 * remaining teams keep participant-ID labels until an authoritative mapping is
 * supplied. Home is always Participant1 (Participant1IsHome === true for all 6).
 */

/** Known participant-id → display-name overrides. Extend as names are confirmed. */
const TEAM_NAMES: Record<number, string> = {
  1999: "France",
  2530: "Morocco",
};

export function teamName(participantId: number): string {
  return TEAM_NAMES[participantId] ?? `Team ${participantId}`;
}

export const FIXTURES: Record<string, FixtureMeta> = {
  "18209181": {
    fixtureId: "18209181",
    homeTeam: teamName(1999),
    awayTeam: teamName(2530),
    homeParticipantId: 1999,
    awayParticipantId: 2530,
    startTime: 1783627200000,
    competitionId: 72,
    expectedFinalHome: 2,
    expectedFinalAway: 0,
    note: "FRA-MAR",
  },
  "18213979": {
    fixtureId: "18213979",
    homeTeam: teamName(2661),
    awayTeam: teamName(1888),
    homeParticipantId: 2661,
    awayParticipantId: 1888,
    startTime: 1783803600000,
    competitionId: 72,
    expectedFinalHome: 1,
    expectedFinalAway: 2,
    note: "extra time",
  },
  "18218149": {
    fixtureId: "18218149",
    homeTeam: teamName(3021),
    awayTeam: teamName(1575),
    homeParticipantId: 3021,
    awayParticipantId: 1575,
    startTime: 1783710000000,
    competitionId: 72,
    expectedFinalHome: 2,
    expectedFinalAway: 1,
    note: "ends with disconnected",
  },
  "18222446": {
    fixtureId: "18222446",
    homeTeam: teamName(1489),
    awayTeam: teamName(3099),
    homeParticipantId: 1489,
    awayParticipantId: 3099,
    startTime: 1783818000000,
    competitionId: 72,
    expectedFinalHome: 3,
    expectedFinalAway: 1,
    note: "extra time; only red card",
  },
  "18237038": {
    fixtureId: "18237038",
    homeTeam: teamName(1999),
    awayTeam: teamName(3021),
    homeParticipantId: 1999,
    awayParticipantId: 3021,
    startTime: 1784055600000,
    competitionId: 72,
    expectedFinalHome: 0,
    expectedFinalAway: 2,
    note: "no historical.raw.json",
  },
  "18241006": {
    fixtureId: "18241006",
    homeTeam: teamName(1888),
    awayTeam: teamName(1489),
    homeParticipantId: 1888,
    awayParticipantId: 1489,
    startTime: 1784142000000,
    competitionId: 72,
    expectedFinalHome: 1,
    expectedFinalAway: 2,
    note: "no historical.raw.json; ends with disconnected",
  },
};

export const FIXTURE_IDS = Object.keys(FIXTURES);
