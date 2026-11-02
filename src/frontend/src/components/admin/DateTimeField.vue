<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { dateTimePattern, parseDateTime } from '../../lib/dateTimeFormat';

// A text field for a local date and time in the UI language's own layout
// (see lib/dateTimeFormat.ts). The v-model is the text as typed; callers
// turn it into an ISO instant with `parseDateTime` when they save. Empty
// means "no date". Text that does not parse shows an inline error.
defineOptions({ inheritAttrs: false });

const model = defineModel<string>({ required: true });
const { locale, t } = useI18n({ useScope: 'global' });

const pattern = computed(() => dateTimePattern(locale.value));
const invalid = computed(() => !parseDateTime(model.value, locale.value).ok);
</script>

<template>
  <span class="datetime-field">
    <input
      v-bind="$attrs"
      v-model="model"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :placeholder="pattern"
      :aria-invalid="invalid"
    />
    <span v-if="invalid" class="datetime-error" role="alert">
      {{ t('adminWorlds.dateInvalid', { pattern }) }}
    </span>
  </span>
</template>

<style scoped>
.datetime-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.datetime-error {
  color: var(--rival);
  font-size: 12px;
}
</style>
