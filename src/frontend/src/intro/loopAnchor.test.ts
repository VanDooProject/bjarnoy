import { describe, expect, it } from 'vitest';
import { BEATS } from './beats/registry';
import { parseLoopAnchor } from './loopAnchor';

const ids = (...numbers: number[]) => numbers.map((n) => BEATS[n - 1].id);
const all = BEATS.map((b) => b.id);
const parse = (hash: string) => parseLoopAnchor(hash, BEATS);

describe('parseLoopAnchor', () => {
  it('is null for anything that is not a loop anchor', () => {
    for (const hash of ['', '#', '#intro', '#no-intro', '#looping', '#loop1', '#xloop']) expect(parse(hash), hash).toBeNull();
  });

  it('#loop loops every beat', () => {
    expect(parse('#loop')).toEqual(all);
  });

  it('reads single numbers and ranges', () => {
    expect(parse('#loop(2)')).toEqual(ids(2));
    expect(parse('#loop(1-2)')).toEqual(ids(1, 2));
    expect(parse(`#loop(1,${BEATS.length})`)).toEqual(ids(1, BEATS.length));
  });

  it('reads mixed lists, tolerates whitespace and URL encoding', () => {
    expect(parse('#loop(1-2,5)')).toEqual(ids(1, 2, 5));
    expect(parse('#loop( 1 - 2 , 5 )')).toEqual(ids(1, 2, 5));
    expect(parse('#loop(1-2,5)'.replace(/[(),]/g, encodeURIComponent))).toEqual(ids(1, 2, 5));
  });

  it('dedupes and returns story order', () => {
    expect(parse('#loop(5,1-3,2,1)')).toEqual(ids(1, 2, 3, 5));
  });

  it('falls back to every beat when the selection is invalid', () => {
    const bad = ['0', `${BEATS.length + 1}`, '3-1', 'a', '1-', '-2', '1--2', '1-2-3', '', ',', '1,', '1,,2', '1.5'];
    for (const list of bad) expect(parse(`#loop(${list})`), list).toEqual(all);
    expect(parse('#loop(1)x')).toEqual(all);
    expect(parse('#loop(1')).toEqual(all);
  });

  it('tolerates a malformed percent escape', () => {
    expect(parse('#loop(%E0%A4%A)')).toEqual(all);
  });
});
