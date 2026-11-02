import { describe, expect, it } from 'vitest';
import type { WorldReviewFinding } from '../../api/types';
import { FINDINGS_PAGE, filterFindings, formatShare, parseScan, visibleFindings } from './worldReview';

const finding = (severity: WorldReviewFinding['severity'], i = 0): WorldReviewFinding => ({
  kind: 'cutOffLand',
  severity,
  island: i,
  q: i,
  r: 0,
  size: 10,
  message: 'm',
});

describe('worldReview view logic', () => {
  it('filters findings by severity, keeping their order', () => {
    const list = [finding('error', 0), finding('warn', 1), finding('error', 2), finding('info', 3)];

    expect(filterFindings(list, 'all')).toEqual(list);
    expect(filterFindings(list, 'error').map((f) => f.island)).toEqual([0, 2]);
    expect(filterFindings(list, 'info').map((f) => f.island)).toEqual([3]);
  });

  it('pages a long list unless everything is asked for', () => {
    const list = Array.from({ length: FINDINGS_PAGE + 5 }, (_, i) => finding('info', i));

    expect(visibleFindings(list, false)).toHaveLength(FINDINGS_PAGE);
    expect(visibleFindings(list, true)).toHaveLength(FINDINGS_PAGE + 5);
  });

  it('formats a share as a percentage with one decimal', () => {
    expect(formatShare(0.0134)).toBe('1.3%');
    expect(formatShare(0)).toBe('0.0%');
    expect(formatShare(0.086)).toBe('8.6%');
  });

  it('parses the scan form and refuses bad seeds and counts', () => {
    expect(parseScan('10', '4')).toEqual({ seedFrom: 10, count: 4 });
    expect(parseScan('', '4')).toBe('badSeed');
    expect(parseScan('1.5', '4')).toBe('badSeed');
    expect(parseScan('10', '0')).toBe('badCount');
    expect(parseScan('10', '9')).toBe('badCount');
    expect(parseScan(String(2 ** 31 - 1), '2')).toBe('badSeed');
    expect(parseScan(String(2 ** 31 - 1), '1')).toEqual({ seedFrom: 2 ** 31 - 1, count: 1 });
  });
});
