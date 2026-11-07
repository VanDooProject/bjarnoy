import { describe, expect, it } from 'vitest';
import { introText } from './introText';
describe('introText', () => {
    it('reads flat and nested keys per locale', () => {
        expect(introText('en', 'skip')).toBe('Skip');
        expect(introText('de', 'skip')).toBe('Überspringen');
        expect(introText('de', 'beats.landfall')).toBe('Land!');
    });
    it('falls back to the key when missing', () => {
        expect(introText('en', 'beats.nope')).toBe('beats.nope');
    });
});
