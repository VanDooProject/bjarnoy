<script setup lang="ts">
// The mobile-only HUD bar's top/bottom docking preference (stores/hudPrefs.ts)
// — a debug/UX-research flag, not an everyday setting, so it lives in the
// player's own profile rather than a HUD-adjacent quick menu. Segmented
// control styled after LocaleSwitcher.vue's .option/.option.active pattern
// (that component itself is untouched — out of scope for this feature).
import { useI18n } from 'vue-i18n';
import { useHudPrefsStore, type HudBarPosition } from '../../stores/hudPrefs';
import type { MessageSchema } from '../../i18n/schema';

const hudPrefs = useHudPrefsStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const POSITIONS: HudBarPosition[] = ['top', 'bottom'];
</script>

<template>
  <section class="hud-preferences">
    <h2>{{ t('profile.hudBar.title') }}</h2>
    <p class="hint">{{ t('profile.hudBar.hint') }}</p>
    <div class="position-toggle" role="group" :aria-label="t('profile.hudBar.position')">
      <button
        v-for="position in POSITIONS"
        :key="position"
        type="button"
        class="option"
        :class="{ active: hudPrefs.barPosition === position }"
        :aria-pressed="hudPrefs.barPosition === position"
        @click="hudPrefs.setBarPosition(position)"
      >
        {{ t(`profile.hudBar.${position}`) }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.hud-preferences h2 {
  margin: 0 0 4px;
}
.hint {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--muted);
}
.position-toggle {
  display: flex;
  gap: 4px;
}
.option {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--muted);
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  font-family: inherit;
}
.option:hover {
  color: var(--text);
  border-color: var(--gold);
}
.option.active {
  color: #20160a;
  background: var(--gold);
  border-color: var(--gold);
}
</style>
