// View logic of the world review panel and the seed scan in AdminWorldReseedView.vue. The review itself is computed by the
// backend (Bjarnoy.Domain.World.Review.WorldReview); nothing here re-derives a check, it only filters and formats.
import type { WorldReviewFinding, WorldReviewSeverity, WorldReviewSummary } from '../../api/types';

/** Mirrors ReviewWorldSeedsRequest.MaxCount on the backend. */
export const MAX_SCAN_COUNT = 8;

/** Rows the findings table renders before "show all": a radius-4000 world has several hundred findings. */
export const FINDINGS_PAGE = 100;

export type SeverityFilter = WorldReviewSeverity | 'all';

export function filterFindings(findings: readonly WorldReviewFinding[], filter: SeverityFilter): WorldReviewFinding[] {
  return filter === 'all' ? [...findings] : findings.filter((f) => f.severity === filter);
}

/** The rows to render: the first `FINDINGS_PAGE` unless everything was asked for. */
export function visibleFindings(findings: readonly WorldReviewFinding[], showAll: boolean): WorldReviewFinding[] {
  return showAll ? [...findings] : findings.slice(0, FINDINGS_PAGE);
}

/** A share (0.0134) as a percentage with one decimal ("1.3%"). */
export function formatShare(share: number): string {
  return `${(Math.round(share * 1000) / 10).toFixed(1)}%`;
}

/** A stable key for a finding row (findings carry no id). */
export function findingKey(f: WorldReviewFinding, index: number): string {
  return `${f.kind}:${f.island}:${f.q},${f.r}:${index}`;
}

/** The summary counts the panel lists, in order, as [i18n key under adminWorldReview, value, worth highlighting]. */
export function summaryRows(s: WorldReviewSummary): { key: keyof WorldReviewSummary; value: string; flagged: boolean }[] {
  const n = (key: keyof WorldReviewSummary, flagged = false) => ({ key, value: String(s[key]), flagged });
  return [
    n('landingSpots'),
    n('islandsWithLandingCandidate'),
    n('islandsWithoutLandingSpots', s.islandsWithoutLandingSpots > 0),
    n('islandsMissingBog', s.islandsMissingBog > 0),
    n('cutOffRegions', s.cutOffRegions > 0),
    n('cutOffTiles'),
    { key: 'cutOffShare', value: formatShare(s.cutOffShare), flagged: false },
    { key: 'worstIslandCutOffShare', value: formatShare(s.worstIslandCutOffShare), flagged: false },
    n('bogRuleViolations', s.bogRuleViolations > 0),
    n('inlandRiverMouths', s.inlandRiverMouths > 0),
    n('wastedNearGreen', s.wastedNearGreen > 0),
  ];
}

/**
 * Parses the scan form: whole numbers, a count of 1..MAX_SCAN_COUNT, and a range that stays a 32-bit seed. Takes numbers
 * too: `v-model` on a `type="number"` input hands back a number once edited.
 */
export function parseScan(
  fromText: string | number,
  countText: string | number,
): { seedFrom: number; count: number } | 'badSeed' | 'badCount' {
  const seedFrom = Number(fromText);
  const count = Number(countText);
  if (String(fromText).trim() === '' || !Number.isInteger(seedFrom) || seedFrom < -(2 ** 31) || seedFrom > 2 ** 31 - 1) return 'badSeed';
  if (!Number.isInteger(count) || count < 1 || count > MAX_SCAN_COUNT) return 'badCount';
  if (seedFrom + count - 1 > 2 ** 31 - 1) return 'badSeed';
  return { seedFrom, count };
}
