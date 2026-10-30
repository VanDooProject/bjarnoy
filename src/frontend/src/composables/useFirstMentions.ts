import { inject, provide, type InjectionKey } from 'vue';

// Docs text links a building only where it is first named on a page; later
// mentions of the same building stay plain words (BuildingLink.vue). A page
// provides one `FirstMentions` (DocsPageLayout does, so every docs page has
// it) and each BuildingLink claims its type while it is set up.

export interface FirstMentions {
  /** True when `owner` is, or now becomes, the first mention of `type` on this page. */
  claim(type: string, owner: object): boolean;
  /** Gives the mention up when its link goes away, so the next one can take over. */
  release(type: string, owner: object): void;
}

const KEY: InjectionKey<FirstMentions> = Symbol('firstMentions');

export function createFirstMentions(): FirstMentions {
  const owners = new Map<string, object>();
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
      if (owners.get(type) === owner) owners.delete(type);
    },
  };
}

/** Provides a fresh first-mention register to everything below the calling component (one per page). */
export function provideFirstMentions(): FirstMentions {
  const mentions = createFirstMentions();
  provide(KEY, mentions);
  return mentions;
}

/** The page's register, or `null` outside a docs page (every mention then links). */
export function useFirstMentions(): FirstMentions | null {
  return inject(KEY, null);
}
