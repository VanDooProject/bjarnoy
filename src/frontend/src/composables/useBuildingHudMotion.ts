// Every animation of the building HUD (components/hud/BuildingHudLayer.vue), in one place:
//  - show / hide of all markers: the dial spins around its own centre, the box folds / unfolds, each marker delayed by its
//    distance to the Longhouse marker (the wave);
//  - a marker's box changing: one element resizing in place (mid <-> near, or other content at the same tier), the old rows
//    cross-fading into the new ones; folding into / unfolding from the dial (no box <-> box); the number fading (far <-> dial).
// Web Animations only: the animations write no inline style, so the layer's per-frame placement transform never clashes with
// them. Where `Element.animate` does not exist, every call falls back to the end state at once (a capability check).
// The game's own reduced-motion setting (`animationPreference.reducedMotion`) turns each of them into a 150 ms opacity fade.
import { animationPreference } from '../lib/perf/animationPreference';

/** Timings (ms) and curves. */
export const HUD_MOTION = {
  /** Reduced motion: every animation is this opacity fade. */
  fade: 150,
  /** Showing / hiding all markers. */
  hideBoxFold: 150,
  hideDialSpin: 300,
  /** The dial starts spinning this long after the box began to fold. */
  hideDialDelay: 100,
  showDialSpin: 380,
  showBoxUnfold: 220,
  /** The box unfolds this long after the dial began to spin in. */
  showBoxDelay: 280,
  /** The wave: a marker waits `distance px * waveMsPerPx`, at most `waveMaxMs`. */
  waveMsPerPx: 1.2,
  waveMaxMs: 450,
  /** A box appearing from / folding into the dial. */
  unfold: 220,
  fold: 160,
  /** One box resizing: mid <-> near, and other content at the same tier. */
  resizeTier: 300,
  resizeContent: 240,
  /** Growing: the old rows stay until this share of the resize. */
  growSwapAt: 0.6,
  textOut: 80,
  textIn: 140,
  /** The number of the dial appearing / disappearing. */
  label: 150,
  easing: 'cubic-bezier(.4,0,.2,1)',
  spinOutEasing: 'cubic-bezier(.5,0,.8,.6)',
} as const;

export type BoxChange = 'grow' | 'shrink' | 'content';

/** Delay of the wave for a marker `distancePx` (screen px) from the Longhouse's. */
export function waveDelayMs(distancePx: number): number {
  return Math.round(Math.min(HUD_MOTION.waveMaxMs, Math.max(0, distancePx) * HUD_MOTION.waveMsPerPx));
}

/** Per-marker delays of the wave from `origin`; without an origin (no Longhouse marker) nothing waits. */
export function waveDelays(
  points: readonly { key: string; x: number; y: number }[],
  origin: { x: number; y: number } | null,
): Map<string, number> {
  return new Map(points.map((p) => [p.key, origin ? waveDelayMs(Math.hypot(p.x - origin.x, p.y - origin.y)) : 0]));
}

/** What a resize is called by the tiers it goes between (box to box); the same tier is a content change. */
export function boxChangeFor(from: string, to: string): BoxChange {
  if (from === to) return 'content';
  return to === 'near' ? 'grow' : 'shrink';
}

/** The keyframes' kind for the current setting: full motion, or only an opacity fade. */
export function motionStyleFor(reducedMotion: boolean): 'full' | 'fade' {
  return reducedMotion ? 'fade' : 'full';
}

const canAnimate = (el: Element): boolean => typeof (el as { animate?: unknown }).animate === 'function';

/** Plays `frames` on `el`; null where Web Animations are missing. Without `hold` the effect is dropped when it ends. */
function play(el: Element, frames: Keyframe[], timing: KeyframeAnimationOptions, hold = false): Animation | null {
  if (!canAnimate(el)) return null;
  const anim = el.animate(frames, { fill: 'both', easing: HUD_MOTION.easing, ...timing });
  if (!hold) anim.addEventListener('finish', () => anim.cancel());
  return anim;
}

/** `done` once, when the animation ends or is cancelled (whichever comes first). */
function onEnd(anim: Animation, done: () => void) {
  let called = false;
  const once = () => {
    if (called) return;
    called = true;
    done();
  };
  anim.addEventListener('finish', once);
  anim.addEventListener('cancel', once);
}

const FADE_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const FADE_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }];
const FOLD: Keyframe[] = [
  { transform: 'scaleX(1)', opacity: 1 },
  { transform: 'scaleX(0)', opacity: 0 },
];
const UNFOLD: Keyframe[] = [...FOLD].reverse();

/** What `snapshotBox` keeps of a box before its content changes. */
export interface BoxSnapshot {
  width: number;
  height: number;
  paddingLeft: string;
  /** The rows as they were, shown above the box until they have faded out. */
  rows: Node | null;
}

/** One marker's parts as the show / hide needs them. */
export interface MarkerParts {
  key: string;
  dial: HTMLElement | null;
  box: HTMLElement | null;
  /** Wave delay (ms). */
  delayMs: number;
}

interface Phase {
  dir: 'in' | 'out';
  anims: Animation[];
  done: Promise<void>;
}

export interface BuildingHudMotion {
  /**
   * Shows or hides the markers. Resolves once every one of them has settled in its final state; a call that turns the other
   * way while one is running reverses the running animations (nothing jumps) and settles the earlier call as well.
   */
  setShown(on: boolean, markers: readonly MarkerParts[]): Promise<void>;
  /** Before the box's content changes: its size and rows. */
  snapshotBox(box: HTMLElement | null): BoxSnapshot | null;
  /** After the content changed: resizes the box from the snapshot to its new size and fades the new rows in. */
  morphBox(box: HTMLElement, from: BoxSnapshot | null, change: BoxChange): void;
  /** `<Transition>` hooks of a box appearing / going away (no box <-> box). */
  unfoldBox(el: Element, done: () => void): void;
  foldBox(el: Element, done: () => void): void;
  /** `<Transition>` hooks of the dial's number. */
  fadeLabel(el: Element, direction: 'in' | 'out', done: () => void): void;
  /** Stops everything that is still running. */
  dispose(): void;
}

export function createBuildingHudMotion(isReduced: () => boolean = () => animationPreference.reducedMotion): BuildingHudMotion {
  const phases = new Map<string, Phase>();
  /** Animations of a finished hide, holding the markers away until they are removed. */
  const held = new Map<string, Animation[]>();
  const morphs = new Map<HTMLElement, () => void>();

  function startPhase(dir: 'in' | 'out', m: MarkerParts, reduced: boolean): Phase | null {
    const anims: Animation[] = [];
    const add = (a: Animation | null) => a && anims.push(a);
    if (reduced) {
      const timing = { duration: HUD_MOTION.fade, easing: 'linear' };
      for (const el of [m.dial, m.box]) if (el) add(play(el, dir === 'in' ? FADE_IN : FADE_OUT, timing, true));
    } else if (dir === 'out') {
      if (m.box) add(play(m.box, FOLD, { duration: HUD_MOTION.hideBoxFold, delay: m.delayMs }, true));
      if (m.dial) {
        add(
          play(
            m.dial,
            [
              { transform: 'rotate(0) scale(1)', opacity: 1 },
              { transform: 'rotate(-180deg) scale(0)', opacity: 0 },
            ],
            { duration: HUD_MOTION.hideDialSpin, delay: m.delayMs + HUD_MOTION.hideDialDelay, easing: HUD_MOTION.spinOutEasing },
            true,
          ),
        );
      }
    } else {
      if (m.dial) {
        add(
          play(
            m.dial,
            [
              { transform: 'rotate(180deg) scale(0)', opacity: 0 },
              { transform: 'rotate(-10deg) scale(1.06)', opacity: 1, offset: 0.75 },
              { transform: 'rotate(0) scale(1)', opacity: 1 },
            ],
            { duration: HUD_MOTION.showDialSpin, delay: m.delayMs },
            true,
          ),
        );
      }
      if (m.box) add(play(m.box, UNFOLD, { duration: HUD_MOTION.showBoxUnfold, delay: m.delayMs + HUD_MOTION.showBoxDelay }, true));
    }
    if (anims.length === 0) return null;
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const phase: Phase = { dir, anims, done };
    const check = () => {
      if (!anims.every((a) => a.playState === 'finished')) return;
      phases.delete(m.key);
      // Shown again: back to the element's own state. Hidden: the last frame stays until the marker is taken out.
      if (phase.dir === 'in') anims.forEach((a) => a.cancel());
      else held.set(m.key, anims);
      resolve();
    };
    anims.forEach((a) => a.addEventListener('finish', check));
    return phase;
  }

  function setShown(on: boolean, markers: readonly MarkerParts[]): Promise<void> {
    const dir = on ? 'in' : 'out';
    const reduced = isReduced();
    const waits: Promise<void>[] = [];
    for (const m of markers) {
      const running = phases.get(m.key);
      if (running) {
        if (running.dir !== dir) {
          running.dir = dir;
          running.anims.forEach((a) => a.reverse());
        }
        waits.push(running.done);
        continue;
      }
      held.get(m.key)?.forEach((a) => a.cancel());
      held.delete(m.key);
      const phase = startPhase(dir, m, reduced);
      if (!phase) continue;
      phases.set(m.key, phase);
      waits.push(phase.done);
    }
    return Promise.all(waits).then(() => undefined);
  }

  function snapshotBox(box: HTMLElement | null): BoxSnapshot | null {
    if (!box) return null;
    const rows = box.querySelector(':scope > .hud-rows');
    return {
      width: box.offsetWidth,
      height: box.offsetHeight,
      paddingLeft: getComputedStyle(box).paddingLeft,
      rows: rows ? rows.cloneNode(true) : null,
    };
  }

  function morphBox(box: HTMLElement, from: BoxSnapshot | null, change: BoxChange) {
    morphs.get(box)?.();
    if (!from || !canAnimate(box)) return;
    const rows = box.querySelector(':scope > .hud-rows');
    const to = { width: box.offsetWidth, height: box.offsetHeight, paddingLeft: getComputedStyle(box).paddingLeft };
    const reduced = isReduced();
    const anims: Animation[] = [];
    const add = (a: Animation | null) => a && anims.push(a);

    // The old rows stay above the box, fixed, until they have faded out; the box clips them while it resizes.
    let ghost: HTMLElement | null = null;
    if (from.rows) {
      ghost = document.createElement('div');
      ghost.className = 'hud-marker__ghost';
      Object.assign(ghost.style, {
        position: 'absolute',
        inset: '0',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: `4px 8px 4px ${from.paddingLeft}`,
        pointerEvents: 'none',
      });
      ghost.appendChild(from.rows);
      box.appendChild(ghost);
    }

    if (reduced) {
      const timing = { duration: HUD_MOTION.fade, easing: 'linear' };
      if (ghost) add(play(ghost, FADE_OUT, timing));
      if (rows) add(play(rows, FADE_IN, timing));
    } else {
      const duration = change === 'content' ? HUD_MOTION.resizeContent : HUD_MOTION.resizeTier;
      add(
        play(
          box,
          [
            { width: `${from.width}px`, height: `${from.height}px`, paddingLeft: from.paddingLeft },
            { width: `${to.width}px`, height: `${to.height}px`, paddingLeft: to.paddingLeft },
          ],
          { duration },
        ),
      );
      // Growing keeps the old text until most of the box is there; shrinking and content changes swap it at once.
      const outAt = change === 'grow' ? Math.round(duration * HUD_MOTION.growSwapAt) : 0;
      if (ghost) add(play(ghost, FADE_OUT, { duration: HUD_MOTION.textOut, delay: outAt, easing: 'linear' }));
      if (rows) add(play(rows, FADE_IN, { duration: HUD_MOTION.textIn, delay: outAt + HUD_MOTION.textOut, easing: 'linear' }));
    }

    const stop = () => {
      anims.forEach((a) => a.cancel());
      ghost?.remove();
      morphs.delete(box);
    };
    morphs.set(box, stop);
    let remaining = anims.length;
    anims.forEach((a) =>
      a.addEventListener('finish', () => {
        remaining -= 1;
        if (remaining === 0 && morphs.get(box) === stop) stop();
      }),
    );
  }

  function fadeOrFold(el: Element, frames: Keyframe[], ms: number, done: () => void) {
    const reduced = isReduced();
    const anim = play(el, reduced ? (frames === FOLD ? FADE_OUT : FADE_IN) : frames, { duration: reduced ? HUD_MOTION.fade : ms });
    if (!anim) return done();
    onEnd(anim, done);
  }

  return {
    setShown,
    snapshotBox,
    morphBox,
    unfoldBox: (el, done) => fadeOrFold(el, UNFOLD, HUD_MOTION.unfold, done),
    foldBox: (el, done) => fadeOrFold(el, FOLD, HUD_MOTION.fold, done),
    fadeLabel(el, direction, done) {
      const anim = play(el, direction === 'in' ? FADE_IN : FADE_OUT, { duration: HUD_MOTION.label, easing: 'linear' });
      if (!anim) return done();
      onEnd(anim, done);
    },
    dispose() {
      for (const phase of phases.values()) phase.anims.forEach((a) => a.cancel());
      phases.clear();
      held.clear();
      for (const stop of [...morphs.values()]) stop();
    },
  };
}

/** The layer's motion; reads the game's reduced-motion setting each time something starts. */
export function useBuildingHudMotion(): BuildingHudMotion {
  return createBuildingHudMotion();
}
