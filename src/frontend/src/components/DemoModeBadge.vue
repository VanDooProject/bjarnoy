<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { DEMO_MODE } from '../config';
import type { MessageSchema } from '../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <div v-if="DEMO_MODE" class="demo-badge" :title="t('demoModeBadge.title')">
    <span class="label-full">{{ t('demoModeBadge.label') }}</span>
    <span class="label-short">{{ t('demoModeBadge.short') }}</span>
  </div>
</template>

<style scoped>
.demo-badge {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--shell);
  background: var(--gold);
  border-radius: 0 0 8px 8px;
  pointer-events: none;
}
/* Mobile audit: the full sentence-length label wraps to two lines at 390px
   and covers the header underneath it (TopBar sits at the very top too) —
   swap to a short "Demo" chip instead of shrinking/wrapping the long copy. */
.label-short {
  display: none;
}
@media (max-width: 768px) {
  .demo-badge {
    font-size: 10px;
    padding: 1px 8px;
    white-space: nowrap;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    /* Anywhere along the top it sits on a header control or the title
       (mobile.spec.ts's "demo badge never covers a header control"), so on
       a phone it tucks into the bottom-left corner instead — clear of the
       onboarding checklist, which docks above the landing footer. */
    top: auto;
    bottom: env(safe-area-inset-bottom, 0px);
    left: 0;
    transform: none;
    border-radius: 0 8px 0 0;
  }
  .label-full {
    display: none;
  }
  .label-short {
    display: inline;
  }
}
</style>
