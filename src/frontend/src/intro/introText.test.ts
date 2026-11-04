import { describe, expect, it } from 'vitest';
import { introText, readingMs } from './introText';

describe('introText', () => {
  it('reads flat and nested keys per locale', () => {
    expect(introText('en', 'skip')).toBe('Skip');
    expect(introText('de', 'skip')).toBe('Überspringen');
    expect(introText('de', 'beats.landfall')).toBe('Land!');
  });
  it('falls back to the key when missing', () => {
    expect(introText('en', 'beats.nope')).toBe('beats.nope');
  });
  // The hold waits this long before landfall can cut its narration off.
  it('reading time is 1 s plus the words at 230 per minute', () => {
    expect(readingMs('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree')).toBe(7000);
    expect(readingMs('  Land!  ')).toBe(1261);
  });
});
