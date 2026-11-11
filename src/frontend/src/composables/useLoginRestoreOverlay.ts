// What MapStatusOverlay shows while a login's realm restore runs (progress,
// or the restore failing with a Retry). One mapping for every screen that
// hosts the login (LandingView's gate panel, LoginView), fed from the login
// flow store, so the copy and the retry behaviour are not written per view.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLoginFlowStore } from '../stores/loginFlow';
import type { MessageSchema } from '../i18n/schema';

export function useLoginRestoreOverlay() {
  const flow = useLoginFlowStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

  const active = computed(() => flow.phase === 'restore');
  const error = computed<unknown>(() => (active.value ? flow.restoreError : null));
  const step = computed(() =>
    active.value && flow.restoreError === null
      ? [t('login.restoring', { name: flow.accountName ?? '' }), flow.slow ? t('login.slow') : '']
          .filter(Boolean)
          .join(' ')
      : null,
  );
  const errorTitle = computed(() => (error.value !== null ? t('login.errors.restoreFailedTitle') : undefined));
  function retry() {
    void flow.retryRestore();
  }

  return { active, step, error, errorTitle, retry };
}
