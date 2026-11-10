// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import IntroTimeline from './IntroTimeline.vue';
import { BEATS } from './beats/registry';
import { beatsFor, holdMinMs } from './introVoice';
import type { IntroState } from './sequencer';
import { buildTimeline, fmtTime, selectBeats, type LoadRow } from './timeline';

const timeline = buildTimeline(selectBeats(beatsFor('en', BEATS), 'landing'), holdMinMs('en'));
const [fire, prophecy, sending, , hold, landfall] = timeline.chapters;
const HOLD_END = hold.startMs + hold.durMs;

const playing: IntroState = {
  phase: 'playing',
  beat: 'fire',
  cycle: 0,
  round: 0,
  skipVisible: false,
  paused: false,
  offsetMs: 0,
  seq: 0,
  waiting: false,
  closed: false,
};

let position = 0;
type Props = InstanceType<typeof IntroTimeline>['$props'];
function mountBar(over: Partial<Props> = {}): VueWrapper {
  return mount(IntroTimeline, {
    props: {
      timeline,
      state: playing,
      getPosition: () => position,
      locale: 'en',
      paused: false,
      gated: false,
      locked: false,
      loadFraction: 0,
      loadRows: [],
      sound: false,
      volume: 100,
      reducedMotion: false,
      ...over,
    },
  });
}
const slider = (w: VueWrapper) => w.get('[data-testid="intro-timeline"]');
const bar = (w: VueWrapper) => w.get('.bar');
const key = async (w: VueWrapper, k: string) => slider(w).trigger('keydown', { key: k });
/** jsdom has no PointerEvent: a mouse event under the pointer event's name carries the coordinates. */
async function pointer(w: VueWrapper, selector: string, type: string, init: MouseEventInit = {}) {
  w.get(selector).element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
  await w.vm.$nextTick();
}
const lastSeek = (w: VueWrapper) => w.emitted('seek')!.at(-1)![0];

beforeEach(() => {
  position = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('IntroTimeline', () => {
  it('stops its playhead frame loop once the intro is closed', async () => {
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    const w = mountBar();
    expect(raf).toHaveBeenCalled();
    await w.setProps({ state: { ...playing, closed: true } });
    raf.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(raf).not.toHaveBeenCalled();
  });

  it('draws one segment per chapter, as wide as the chapter is long, with the played part filled', async () => {
    position = fire.durMs + prophecy.durMs / 2;
    const w = mountBar({ state: { ...playing, beat: 'prophecy' } });
    const segs = w.findAll('.sg');
    expect(segs.map((s) => s.attributes('data-chapter'))).toEqual(timeline.chapters.map((c) => c.id));
    const widthPct = (i: number) => Number(/width: calc\(([\d.]+)%/.exec(segs[i].attributes('style')!)![1]);
    expect(widthPct(1)).toBeCloseTo((prophecy.durMs / timeline.totalMs) * 100, 2);
    expect(segs[1].attributes('style')).toContain('- 3px');
    const scale = (i: number) => Number(/scaleX\(([\d.]+)\)/.exec(segs[i].get('.fill').attributes('style')!)![1]);
    expect(scale(0)).toBe(1);
    expect(scale(1)).toBeCloseTo(0.5);
    expect(scale(2)).toBe(0);
    w.unmount();
  });

  it('shows the time and follows the clock on animation frames only while playing', async () => {
    const w = mountBar();
    expect(w.get('[data-testid="intro-time"]').text()).toBe(`0:00 / ${fmtTime(timeline.totalMs)}`);
    position = 12_500;
    await vi.advanceTimersByTimeAsync(40);
    expect(w.get('[data-testid="intro-time"]').text()).toMatch(/^0:12 /);
    await w.setProps({ state: { ...playing, paused: true } });
    position = 30_000;
    await vi.advanceTimersByTimeAsync(100);
    expect(w.get('[data-testid="intro-time"]').text()).toMatch(/^0:12 /); // no frames while paused
    // a new state (a seek) reads the position at once
    await w.setProps({ state: { ...playing, paused: true, seq: 1 } });
    expect(w.get('[data-testid="intro-time"]').text()).toMatch(/^0:30 /);
    w.unmount();
  });

  it('is a slider with the chapter and time as its value text, per locale', async () => {
    position = 12_000;
    const en = mountBar();
    expect(slider(en).attributes('role')).toBe('slider');
    expect(slider(en).attributes('aria-valuenow')).toBe('12');
    expect(slider(en).attributes('aria-valuetext')).toBe(`Skald's fire, 0:12 of ${fmtTime(timeline.totalMs)}`);
    const de = mountBar({ locale: 'de', state: { ...playing, beat: 'prophecy' } });
    expect(slider(de).attributes('aria-valuetext')).toBe(`Die Weissagung, 0:12 von ${fmtTime(timeline.totalMs)}`);
    en.unmount();
    de.unmount();
  });

  describe('keyboard', () => {
    it('arrows move by 5 s', async () => {
      position = 20_000;
      const w = mountBar({ state: { ...playing, beat: 'sending' } });
      await key(w, 'ArrowRight');
      expect(lastSeek(w)).toBe(25_000);
      await key(w, 'ArrowLeft');
      expect(lastSeek(w)).toBe(15_000);
    });

    it('PageDown goes to the next chapter start, PageUp to the start of this one or, close to it, the previous one', async () => {
      position = sending.startMs + 5000;
      const w = mountBar({ state: { ...playing, beat: 'sending' } });
      await key(w, 'PageDown');
      expect(lastSeek(w)).toBe(timeline.chapters[3].startMs);
      await key(w, 'PageUp');
      expect(lastSeek(w)).toBe(sending.startMs);
      position = sending.startMs + 500;
      await key(w, 'PageUp');
      expect(lastSeek(w)).toBe(prophecy.startMs);
    });

    it('PageDown on the last chapter and PageUp on the first stay put', async () => {
      const first = mountBar();
      await key(first, 'PageUp');
      expect(lastSeek(first)).toBe(0);
      position = landfall.startMs + 100;
      const last = mountBar({ state: { ...playing, beat: 'landfall', phase: 'exiting' } });
      await key(last, 'PageDown');
      expect(lastSeek(last)).toBe(landfall.startMs);
    });

    it('Home goes to the start, End to the end, or to the hold end while the landfall is locked', async () => {
      const open = mountBar();
      await key(open, 'End');
      expect(lastSeek(open)).toBe(timeline.totalMs);
      await key(open, 'Home');
      expect(lastSeek(open)).toBe(0);
      const gated = mountBar({ gated: true });
      await key(gated, 'End');
      expect(lastSeek(gated)).toBe(HOLD_END);
      expect(slider(gated).attributes('aria-valuemax')).toBe(String(Math.round(HOLD_END / 1000)));
    });

    it('other keys and keys with a modifier are left alone; a locked bar ignores them all', async () => {
      const w = mountBar();
      await key(w, 'a');
      await slider(w).trigger('keydown', { key: 'ArrowRight', ctrlKey: true });
      expect(w.emitted('seek')).toBeUndefined();
      const locked = mountBar({ locked: true });
      await key(locked, 'End');
      expect(locked.emitted('seek')).toBeUndefined();
    });
  });

  describe('pointer', () => {
    function withTrackRect(w: VueWrapper) {
      vi.spyOn(w.get('.track').element, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 1000, right: 1100, top: 0, bottom: 3, height: 3, x: 100, y: 0, toJSON: () => ({}) });
    }

    it('click and drag seek to the pointer, and tell the host when a drag starts and ends', async () => {
      const w = mountBar();
      withTrackRect(w);
      await pointer(w, '[data-testid="intro-timeline"]', 'pointerdown', { clientX: 600 });
      expect(w.emitted('drag-start')).toHaveLength(1);
      expect(lastSeek(w)).toBeCloseTo(timeline.totalMs / 2);
      await pointer(w, '[data-testid="intro-timeline"]', 'pointermove', { clientX: 1100 });
      expect(lastSeek(w)).toBeCloseTo(timeline.totalMs);
      expect(bar(w).classes()).toContain('expanded');
      await slider(w).trigger('pointerup');
      expect(w.emitted('drag-end')).toHaveLength(1);
      const n = w.emitted('seek')!.length;
      await pointer(w, '[data-testid="intro-timeline"]', 'pointermove', { clientX: 200 });
      expect(w.emitted('seek')).toHaveLength(n); // a move without a drag seeks nothing
    });

    it('a locked bar starts no drag', async () => {
      const w = mountBar({ locked: true });
      withTrackRect(w);
      await pointer(w, '[data-testid="intro-timeline"]', 'pointerdown', { clientX: 600 });
      expect(w.emitted('drag-start')).toBeUndefined();
      expect(w.emitted('seek')).toBeUndefined();
      expect(bar(w).classes()).toContain('locked');
    });
  });

  describe('expanded', () => {
    it('opens on hover over the timeline, on keyboard focus and when paused, not on the other buttons', async () => {
      const w = mountBar();
      expect(bar(w).classes()).not.toContain('expanded');
      await w.get('[data-testid="intro-pause"]').trigger('pointerenter');
      await w.get('[data-testid="intro-sound"]').trigger('pointerenter');
      expect(bar(w).classes()).not.toContain('expanded');
      await bar(w).trigger('pointerenter');
      expect(bar(w).classes()).toContain('expanded');
      await bar(w).trigger('pointerleave');
      expect(bar(w).classes()).not.toContain('expanded');
      await slider(w).trigger('focus');
      expect(bar(w).classes()).toContain('expanded');
      await slider(w).trigger('blur');
      await w.setProps({ paused: true });
      expect(bar(w).classes()).toContain('expanded');
    });

    it('is closed on a locked bar, whatever else is going on', async () => {
      const w = mountBar({ locked: true, paused: true });
      await bar(w).trigger('pointerenter');
      expect(bar(w).classes()).not.toContain('expanded');
    });

    it('names the current chapter in bold; a narrow bar names only that one', async () => {
      const w = mountBar({ state: { ...playing, beat: 'ravens' } });
      const labels = w.findAll('.clabel:not(.one)');
      expect(labels.map((l) => l.text())).toEqual(["Skald's fire", 'Prophecy', 'The sending', 'Ravens', 'Fog', 'Landfall']);
      expect(w.findAll('.clabel.cur:not(.one)').map((l) => l.text())).toEqual(['Ravens']);
      expect(bar(w).classes()).not.toContain('narrow');
      vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
      const narrow = mountBar({ state: { ...playing, beat: 'ravens' } });
      await narrow.vm.$nextTick();
      expect(bar(narrow).classes()).toContain('narrow');
      expect(narrow.get('.clabel.one').text()).toBe('Ravens');
    });
  });

  describe('landing load', () => {
    it('hatches the landfall while the tiles are not loaded and fills it with the load fraction; the hatch goes with the load', async () => {
      const w = mountBar({ gated: true, loadFraction: 0.4 });
      const last = w.findAll('.sg').at(-1)!;
      expect(last.classes()).toContain('lockd');
      expect(last.get('.bufl').attributes('style')).toContain('scaleX(0.4)');
      expect(w.findAll('.sg.lockd')).toHaveLength(1);
      await w.setProps({ gated: false });
      expect(last.classes()).not.toContain('lockd');
      expect(last.get('.bufl').attributes('style')).toContain('scaleX(0)');
    });

    it('a static hatch with reduced motion', async () => {
      const w = mountBar({ gated: true, reducedMotion: true });
      expect(w.get('.ctrl').classes()).toContain('is-still');
    });

    it('waiting: the thumb gives way to a spinner', async () => {
      const w = mountBar({ state: { ...playing, beat: 'hold', waiting: true } });
      expect(w.get('.thumb').classes()).toContain('hidden');
      expect(w.get('.spin').classes()).toContain('show');
      expect(w.get('.sg.waiting').attributes('data-chapter')).toBe('hold');
      await w.setProps({ state: { ...playing, beat: 'hold' } });
      expect(w.get('.thumb').classes()).not.toContain('hidden');
      expect(w.get('.spin').classes()).not.toContain('show');
    });

    const rows: LoadRow[] = [
      { id: 'voices', loaded: 6, total: 6, gating: true },
      { id: 'terrain', loaded: 6, total: 9, gating: true },
      { id: 'animations', loaded: 1, total: 25, gating: false },
    ];

    it('lists the groups with their counts while the bar is open, the animations apart, over the landfall', async () => {
      const w = mountBar({ loadRows: rows });
      const stack = w.get('[data-testid="intro-load-detail"]');
      expect(stack.classes()).not.toContain('show');
      await bar(w).trigger('pointerenter');
      expect(stack.classes()).toContain('show');
      expect(w.emitted('detail-open')!.at(-1)).toEqual([true]);
      expect(stack.findAll('.srow').map((r) => r.text())).toEqual(['Voices6/6', 'Terrain6/9', 'Animations1/25']);
      expect(stack.findAll('.srow').map((r) => r.classes().includes('anim'))).toEqual([false, false, true]);
      expect(stack.attributes('style')).toContain('right: 1.5px');
      expect(stack.attributes('style')).toMatch(/width: max\(.*- 3px.*, 64px\)/);
      await bar(w).trigger('pointerleave');
      expect(w.emitted('detail-open')!.at(-1)).toEqual([false]);
    });

    it('shows nothing when there is nothing left to load', async () => {
      const w = mountBar({ loadRows: [], paused: true });
      expect(w.find('[data-testid="intro-load-detail"]').exists()).toBe(false);
    });
  });

  describe('speaker and volume', () => {
    it('the speaker button emits sound, labelled for what it does; its icon follows the level', async () => {
      const w = mountBar({ sound: false });
      const btn = w.get('[data-testid="intro-sound"]');
      expect(btn.attributes('aria-label')).toBe('Turn sound on');
      expect(btn.attributes('data-level')).toBe('0');
      await btn.trigger('click');
      expect(w.emitted('sound')).toHaveLength(1);
      await w.setProps({ sound: true, volume: 30 });
      expect(btn.attributes('aria-label')).toBe('Turn sound off');
      expect(btn.attributes('data-level')).toBe('1');
      await w.setProps({ volume: 80 });
      expect(btn.attributes('data-level')).toBe('2');
    });

    it('the range reads 0 while muted and has the vertical slider semantics', async () => {
      const w = mountBar({ sound: false, volume: 60 });
      const vol = w.get('[data-testid="intro-volume"]');
      expect(vol.attributes('role')).toBe('slider');
      expect(vol.attributes('aria-orientation')).toBe('vertical');
      expect(vol.attributes('aria-valuenow')).toBe('0');
      await w.setProps({ sound: true });
      expect(vol.attributes('aria-valuenow')).toBe('60');
    });

    it('arrows, Page keys, Home and End set the volume', async () => {
      const w = mountBar({ sound: true, volume: 50 });
      const vol = w.get('[data-testid="intro-volume"]');
      const press = async (k: string) => {
        await vol.trigger('keydown', { key: k });
        return w.emitted('volume')!.at(-1)![0];
      };
      expect(await press('ArrowUp')).toBe(60);
      expect(await press('ArrowDown')).toBe(40);
      expect(await press('PageUp')).toBe(75);
      expect(await press('PageDown')).toBe(25);
      expect(await press('Home')).toBe(0);
      expect(await press('End')).toBe(100);
      await w.setProps({ volume: 95 });
      expect(await press('ArrowUp')).toBe(100);
    });

    it('dragging the range sets the volume from the pointer height', async () => {
      const w = mountBar({ sound: true });
      const vol = w.get('[data-testid="intro-volume"]');
      vi.spyOn(w.get('.vtrack').element, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 4, right: 4, top: 0, bottom: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) });
      await pointer(w, '[data-testid="intro-volume"]', 'pointerdown', { clientY: 75 });
      expect(w.emitted('volume')!.at(-1)).toEqual([25]);
      await pointer(w, '[data-testid="intro-volume"]', 'pointermove', { clientY: 0 });
      expect(w.emitted('volume')!.at(-1)).toEqual([100]);
      await vol.trigger('pointerup');
      const n = w.emitted('volume')!.length;
      await pointer(w, '[data-testid="intro-volume"]', 'pointermove', { clientY: 50 });
      expect(w.emitted('volume')).toHaveLength(n);
    });
  });

  it('the play/pause button emits toggle-pause and swaps its label', async () => {
    const w = mountBar();
    await w.get('[data-testid="intro-pause"]').trigger('click');
    expect(w.emitted('toggle-pause')).toHaveLength(1);
    await w.setProps({ paused: true });
    expect(w.get('[data-testid="intro-pause"]').attributes('aria-label')).toBe('Resume');
    expect(w.get('[data-testid="intro-pause"]').attributes('aria-pressed')).toBe('true');
  });
});
