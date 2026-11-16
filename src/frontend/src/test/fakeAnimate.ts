// A stand-in for Web Animations (jsdom has none): every `el.animate(...)` is recorded and stays running until the test
// finishes it, so a test can look at the keyframes, finish them in order, reverse or cancel them.
export class FakeAnimation {
  playState: 'running' | 'finished' | 'idle' = 'running';
  reversed = false;
  private listeners = new Map<string, Set<() => void>>();

  readonly target: Element;
  readonly frames: Keyframe[];
  readonly timing: KeyframeAnimationOptions;

  constructor(target: Element, frames: Keyframe[], timing: KeyframeAnimationOptions) {
    this.target = target;
    this.frames = frames;
    this.timing = timing;
  }

  addEventListener(type: string, cb: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  private emit(type: string) {
    [...(this.listeners.get(type) ?? [])].forEach((cb) => cb());
  }

  finish() {
    if (this.playState !== 'running') return;
    this.playState = 'finished';
    this.emit('finish');
  }

  cancel() {
    this.playState = 'idle';
    this.emit('cancel');
  }

  reverse() {
    this.reversed = !this.reversed;
    this.playState = 'running';
  }
}

export interface FakeAnimate {
  animations: FakeAnimation[];
  /** Animations still running (not finished or cancelled). */
  running(): FakeAnimation[];
  finishAll(): void;
  restore(): void;
}

export function installFakeAnimate(): FakeAnimate {
  const proto = Element.prototype as unknown as { animate?: unknown };
  const before = proto.animate;
  const animations: FakeAnimation[] = [];
  proto.animate = function (this: Element, frames: Keyframe[], timing: KeyframeAnimationOptions) {
    const anim = new FakeAnimation(this, frames, timing);
    animations.push(anim);
    return anim;
  };
  return {
    animations,
    running: () => animations.filter((a) => a.playState === 'running'),
    finishAll: () => animations.forEach((a) => a.finish()),
    restore() {
      if (before === undefined) delete proto.animate;
      else proto.animate = before;
    },
  };
}
