<script setup lang="ts">
// What the map is waiting on (or why it can't continue), drawn over the pale
// fog backdrop. Without it a slow or failed load looks identical: an empty
// fogged map forever. `step` is an already-translated label of the current
// loading phase; `error` is whatever the failed load threw — the technical
// part (which call, which status) comes from describeLoadError and is not
// translated, only the title and retry button are.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { MessageSchema } from "../../i18n/schema";
import { describeLoadError } from "../../lib/loadError";

const props = defineProps<{
  step: string | null;
  error: unknown | null;
  errorTitle?: string;
}>();
const emit = defineEmits<{ retry: [] }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: "global" });

// Same one-shot read as MapLoadingIndicator — a fixed device preference.
const reducedMotion =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const hasError = computed(
  () => props.error !== null && props.error !== undefined,
);
const state = computed<"error" | "loading" | null>(() =>
  hasError.value ? "error" : props.step ? "loading" : null,
);
const described = computed(() =>
  hasError.value ? describeLoadError(props.error) : null,
);
// The summary already includes the detail for plain Errors; skip a duplicate line.
const detail = computed(() =>
  described.value?.detail && described.value.detail !== described.value.summary
    ? described.value.detail
    : null,
);
</script>

<template>
  <div
    v-if="state"
    class="map-status"
    :class="{ 'map-status--reduced': reducedMotion }"
    data-testid="map-status-overlay"
    :data-state="state"
  >
    <div
      v-if="state === 'loading'"
      class="loading"
      role="status"
      aria-live="polite"
    >
      <svg class="hex" viewBox="0 0 100 100" aria-hidden="true">
        <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" />
      </svg>
      <p class="label">{{ step }}</p>
    </div>
    <div v-else class="card" role="alert">
      <h2 class="title">{{ errorTitle ?? t("hud.mapStatus.errorTitle") }}</h2>
      <p class="summary">{{ described!.summary }}</p>
      <p v-if="detail" class="detail">{{ detail }}</p>
      <button type="button" class="retry" @click="emit('retry')">
        {{ t("hud.mapStatus.retry") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Above MapLoadingIndicator (8) so it covers that overlay, below the HUD
   (TopBar/panels sit at 30+) so the header stays usable while the map
   is stuck. The container itself takes pointer events: nothing on the map
   is clickable until it is drawable. */
.map-status {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  background: rgba(20, 28, 36, 0.35);
  pointer-events: auto;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.label {
  margin: 0;
  color: #fdf6e8;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}
.hex {
  width: 48px;
  height: 48px;
  fill: none;
  stroke: var(--gold);
  stroke-width: 6;
  stroke-linejoin: round;
  animation: map-status-pulse 1.6s ease-in-out infinite;
  transform-origin: center;
}
@keyframes map-status-pulse {
  0%,
  100% {
    opacity: 0.4;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
.map-status--reduced .hex {
  animation: none;
  opacity: 1;
  transform: none;
}

.card {
  box-sizing: border-box;
  width: 100%;
  max-width: 420px;
  padding: 18px 20px;
  background: rgba(14, 22, 29, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  color: #fdf6e8;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.summary {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--gold);
  overflow-wrap: anywhere;
}
.detail {
  margin: 0;
  font-size: 13px;
  opacity: 0.85;
  overflow-wrap: anywhere;
}
.retry {
  align-self: flex-start;
  padding: 8px 18px;
  font: inherit;
  font-weight: 600;
  color: #1a1206;
  background: var(--gold);
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.retry:focus-visible {
  outline: 2px solid #fdf6e8;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .hex {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
</style>
