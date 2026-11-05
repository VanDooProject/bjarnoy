import { onBeforeUnmount, ref, type Ref } from 'vue';

/** No input for this long and the intro's controls fade back. */
export const IDLE_DIM_MS = 2500;

/** `idle` turns true after {@link IDLE_DIM_MS} without pointer or key input on the window; any input resets it. */
export function useIdleDim(): Ref<boolean> {
  const idle = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    idle.value = false;
    clearTimeout(timer);
    timer = setTimeout(() => (idle.value = true), IDLE_DIM_MS);
  };
  const events = ['pointermove', 'pointerdown', 'keydown'] as const;
  for (const e of events) window.addEventListener(e, arm, { passive: true });
  arm();
  onBeforeUnmount(() => {
    clearTimeout(timer);
    for (const e of events) window.removeEventListener(e, arm);
  });
  return idle;
}
