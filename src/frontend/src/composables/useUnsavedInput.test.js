import { describe, expect, it } from 'vitest';
import { hasUnsavedInput, registerUnsavedInput } from './useUnsavedInput';
describe('unsaved input registry', () => {
    it('is true while any registered predicate is dirty, and ignores unregistered ones', () => {
        expect(hasUnsavedInput()).toBe(false);
        let dirty = false;
        const unregister = registerUnsavedInput(() => dirty);
        const unregisterOther = registerUnsavedInput(() => false);
        expect(hasUnsavedInput()).toBe(false);
        dirty = true;
        expect(hasUnsavedInput()).toBe(true);
        unregister();
        expect(hasUnsavedInput()).toBe(false);
        unregisterOther();
    });
});
