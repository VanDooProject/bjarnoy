import { ref, shallowRef } from 'vue';

/**
 * Step/error bookkeeping for a multi-phase page load, feeding
 * MapStatusOverlay: `step` is the label of the phase currently running,
 * `error` whatever made the load give up. `load` narrates phases through the
 * `setStep` it is handed; `run()` (also what a Retry calls) clears the old
 * error first, so `load` must be safe to run again after a partial attempt.
 * `settled` is true once a run finished, successfully or not (false again while a retry runs).
 */
export function useLoadFlow(load: (setStep: (label: string | null) => void) => Promise<void>) {
  const step = ref<string | null>(null);
  const error = shallowRef<unknown>(null);
  const settled = ref(false);

  async function run() {
    error.value = null;
    settled.value = false;
    try {
      await load((label) => {
        step.value = label;
      });
    } catch (err) {
      console.error('page load failed', err);
      error.value = err;
    } finally {
      step.value = null;
      settled.value = true;
    }
  }

  return { step, error, settled, run };
}
