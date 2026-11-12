// The settlement's quest list as the quest tray and the panel column's Quests icon read it: which quests this build has
// copy for, the current one, the other claimable ones, and whether there is a notice the player has not seen in the opened
// tray yet (the "new" dot). One place, so the tray and the icon cannot disagree.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { useWorldStore } from '../stores/world';
import { useQuestSeen } from './useQuestSeen';
import type { QuestResponse } from '../api/types';

export function useQuests() {
  const { te } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
  const world = useWorldStore();

  // A quest id from a newer server that this build has no copy for is left out rather than shown as a raw key.
  const known = computed(() => world.hud.quests.filter((q) => te(`quests.items.${q.id}.title`)));
  const unclaimed = computed(() => known.value.filter((q) => !q.claimed));
  const current = computed<QuestResponse | undefined>(() => unclaimed.value[0]);
  // Every quest whose reward can be claimed right now: the current one if it is done, plus the other done ones.
  const claimable = computed(() => unclaimed.value.filter((q) => q.completed));
  const alsoReady = computed(() => unclaimed.value.slice(1).filter((q) => q.completed));

  // The dot says there is something the player has not seen in the opened card yet: a quest that became current, or one
  // that became claimable.
  const noticeKeys = computed(() => {
    const keys: string[] = [];
    if (current.value) keys.push(`${current.value.id}:open`);
    for (const q of unclaimed.value) if (q.completed) keys.push(`${q.id}:ready`);
    return keys;
  });
  const { hasUnseen, markSeen } = useQuestSeen(computed(() => world.selectedSettlementId));
  const hasNew = computed(() => hasUnseen(noticeKeys.value));

  return { known, unclaimed, current, alsoReady, claimable, noticeKeys, hasNew, markSeen };
}
