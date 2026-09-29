import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoadFlow } from './useLoadFlow';

describe('useLoadFlow', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('narrates steps while running and clears the step once done', async () => {
    const seen: (string | null)[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const flow = useLoadFlow(async (setStep) => {
      setStep('first');
      seen.push(flow.step.value);
      await gate;
      setStep('second');
      seen.push(flow.step.value);
    });

    const running = flow.run();
    expect(flow.step.value).toBe('first');
    release();
    await running;

    expect(seen).toEqual(['first', 'second']);
    expect(flow.step.value).toBeNull();
    expect(flow.error.value).toBeNull();
  });

  it('captures a thrown error and clears the step', async () => {
    const boom = new Error('503');
    const flow = useLoadFlow(async (setStep) => {
      setStep('joining');
      throw boom;
    });

    await flow.run();

    expect(flow.error.value).toBe(boom);
    expect(flow.step.value).toBeNull();
  });

  it('clears a previous error when re-run and succeeds on the second attempt', async () => {
    let calls = 0;
    const flow = useLoadFlow(async () => {
      if (++calls === 1) throw new Error('first try');
    });

    await flow.run();
    expect(flow.error.value).not.toBeNull();
    await flow.run();

    expect(flow.error.value).toBeNull();
    expect(calls).toBe(2);
  });
});
