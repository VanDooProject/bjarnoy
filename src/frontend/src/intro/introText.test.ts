import { describe, expect, it } from 'vitest';
import { introText } from './introText';

describe('introText', () => {
  it('reads flat and nested keys per locale', () => {
    expect(introText('en', 'skip')).toBe('Skip');
    expect(introText('de', 'skip')).toBe('Überspringen');
    expect(introText('de', 'beats.landfall')).toBe('Land!');
  });
  it('fills {name} placeholders from the params', () => {
    expect(introText('en', 'landing.mapLoading', { pct: 62 })).toBe('Go to the map · loading 62 %');
    expect(introText('de', 'landing.mapArmed', { pct: 7 })).toBe('Öffnet, sobald geladen · 7 %');
  });
  it('leaves a placeholder without a param as it is', () => {
    expect(introText('en', 'landing.mapLoading', {})).toBe('Go to the map · loading {pct} %');
  });
  it('falls back to the key when missing', () => {
    expect(introText('en', 'beats.nope')).toBe('beats.nope');
  });
});
