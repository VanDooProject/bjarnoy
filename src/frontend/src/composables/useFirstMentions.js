import { inject, provide } from 'vue';
const KEY = Symbol('firstMentions');
export function createFirstMentions() {
    const owners = new Map();
    return {
        claim(type, owner) {
            const current = owners.get(type);
            if (current === undefined) {
                owners.set(type, owner);
                return true;
            }
            return current === owner;
        },
        release(type, owner) {
            if (owners.get(type) === owner)
                owners.delete(type);
        },
    };
}
/** Provides a fresh first-mention register to everything below the calling component (one per page). */
export function provideFirstMentions() {
    const mentions = createFirstMentions();
    provide(KEY, mentions);
    return mentions;
}
/** The page's register, or `null` outside a docs page (every mention then links). */
export function useFirstMentions() {
    return inject(KEY, null);
}
