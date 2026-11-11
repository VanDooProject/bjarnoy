import { useI18n } from 'vue-i18n';
import { joinBlockedKey } from '../lib/joinBlocked';
import type { MessageSchema } from '../i18n/schema';

/** The player-facing line for why a world refuses new players (landing page and world list). */
export function useJoinBlockedLabel(): (reason: string, startsAt: string | null) => string {
  const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
  return (reason, startsAt) => {
    const key = joinBlockedKey(reason, startsAt);
    return key === 'opensAt' && startsAt
      ? t('landing.joinBlocked.opensAt', { date: d(new Date(startsAt), 'long') })
      : t(`landing.joinBlocked.${key}`);
  };
}
