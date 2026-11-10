// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import LandingIntro from './LandingIntro.vue';
import { BEATS } from './beats/registry';
import type { BeatId } from './beats/types';
import { introLoad } from './introLoad';
import { beatsFor, holdMinMs, IntroVoice } from './introVoice';
import { buildTimeline, selectBeats } from './timeline';

// jsdom has no canvas 2D context; the texture is irrelevant to the host's behaviour.
vi.mock('./fogTexture', () => ({ introFogUrl: () => 'data:image/png;base64,' }));

type Props = { mode: 'landing' | 'replay' | 'loop'; loopBeats?: BeatId[]; locale: 'en' | 'de'; reducedMotion: boolean; loaded: boolean; playNow?: boolean; soundOn: boolean };
// The landing page waits for the player; these tests are about the run, so they start it at once (the landing page tests pass `playNow: false`).
const base: Props = { mode: 'landing', locale: 'en', reducedMotion: false, loaded: false, playNow: true, soundOn: false };

vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());

// Every intro listens for keys on `window`. `document.body.innerHTML = ''` removes the DOM but not the Vue app, so an intro a test
// left mounted kept its listeners and answered every later event: the tests slowed down with each one before them and the drag test
// hit the 5 s timeout in a full run. Unmount them all after each test and check no `window` keydown listener outlives them.
const mounted: VueWrapper[] = [];
let addSpy: MockInstance;
let removeSpy: MockInstance;
const keydownListeners = new Set<EventListenerOrEventListenerObject>();
async function mountIntro(p: Partial<Props> = {}) {
  const w = mount(LandingIntro, { props: { ...base, ...p }, attachTo: document.body });
  mounted.push(w);
  await flushPromises();
  return w;
}
const timeline = buildTimeline(selectBeats(beatsFor('en', BEATS), 'landing'), holdMinMs('en'));
const at = (id: BeatId) => timeline.chapters.find((c) => c.id === id)!;
const root = (w: VueWrapper) => w.get('[data-testid="landing-intro"]');
const beat = (w: VueWrapper) => root(w).attributes('data-beat');
const slider = (w: VueWrapper) => w.get('[data-testid="intro-timeline"]');
const press = async (w: VueWrapper, key: string, times = 1) => {
  for (let i = 0; i < times; i++) await slider(w).trigger('keydown', { key });
  await flushPromises();
};
const pointer = async (el: Element, type: string, init: MouseEventInit = {}) => {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
  await flushPromises();
};

beforeEach(() => {
  vi.useFakeTimers();
  keydownListeners.clear();
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  addSpy = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'keydown' && listener) keydownListeners.add(listener);
    add(type, listener, options);
  });
  removeSpy = vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
    if (type === 'keydown' && listener) keydownListeners.delete(listener);
    remove(type, listener, options);
  });
  introLoad.terrain = null;
  introLoad.buildings = null;
  introLoad.animations = null;
});
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  expect(keydownListeners.size).toBe(0);
  addSpy.mockRestore();
  removeSpy.mockRestore();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('LandingIntro timeline', () => {
  it('keys move through the chapters: PageDown to the next, Home back to the first, and the narration follows', async () => {
    const w = await mountIntro();
    await press(w, 'PageDown');
    expect(beat(w)).toBe('prophecy');
    expect(w.get('[data-testid="intro-narration"]').text()).toContain('seers');
    await press(w, 'PageDown', 2);
    expect(beat(w)).toBe('ravens');
    await press(w, 'Home');
    expect(beat(w)).toBe('fire');
    // the beat runs on from where it was entered
    await vi.advanceTimersByTimeAsync(at('fire').durMs - 1);
    expect(beat(w)).toBe('fire');
    await vi.advanceTimersByTimeAsync(1);
    expect(beat(w)).toBe('prophecy');
  });

  it('arrow right moves 5 s, and the voice follows to the new place', async () => {
    const w = await mountIntro();
    await press(w, 'ArrowRight');
    expect(beat(w)).toBe('fire');
    expect(w.get('[data-testid="intro-time"]').text()).toMatch(/^0:05 /);
    await press(w, 'ArrowRight');
    expect(beat(w)).toBe('prophecy');
    expect(root(w).attributes('data-voice-beat')).toBe('prophecy');
  });

  describe('landing gate', () => {
    it('End and the landfall chapter stop at the hold while the tiles load: the hold waits, the thumb is a spinner', async () => {
      const w = await mountIntro();
      await press(w, 'End');
      expect(beat(w)).toBe('hold');
      expect(root(w).attributes('data-phase')).toBe('playing');
      expect(w.get('.spin').classes()).toContain('show');
      await press(w, 'Home');
      await press(w, 'PageDown', 5);
      expect(beat(w)).toBe('hold');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(beat(w)).toBe('hold');
    });

    it('the landfall is hatched and fills with the load; the hatch is gone once loaded', async () => {
      introLoad.terrain = { loaded: 9, total: 9 };
      const w = await mountIntro();
      const landfall = () => w.get('.sg[data-chapter="landfall"]');
      expect(landfall().classes()).toContain('lockd');
      // voices 0/6, terrain 9/9, buildings not reported: (0 + 1 + 0) / 3
      expect(landfall().get('.bufl').attributes('style')).toMatch(/scaleX\(0\.33/);
      await w.setProps({ loaded: true });
      expect(landfall().classes()).not.toContain('lockd');
    });

    it('once loaded, End seeks into the landfall: the exit runs, and the bar is locked', async () => {
      const w = await mountIntro({ loaded: true });
      await press(w, 'PageDown', 5);
      expect(beat(w)).toBe('landfall');
      expect(root(w).attributes('data-phase')).toBe('exiting');
      expect(w.get('.bar').classes()).toContain('locked');
      await press(w, 'Home');
      expect(beat(w)).toBe('landfall');
    });

    it('a seek into the landfall joins its fade out partway', async () => {
      const w = await mountIntro({ loaded: true });
      await press(w, 'PageDown', 4);
      // hold start + 5 s + 5 s runs past the hold minimum into the landfall
      await press(w, 'ArrowRight', 2);
      expect(beat(w)).toBe('landfall');
      const offset = parseFloat((root(w).element as HTMLElement).style.getPropertyValue('--exit-offset'));
      expect(offset).toBeGreaterThan(0);
      expect(offset).toBeLessThan(at('landfall').durMs);
    });

    it('replay has no gate: no hatch, no load list', async () => {
      introLoad.terrain = { loaded: 1, total: 9 };
      const w = await mountIntro({ mode: 'replay' });
      expect(w.find('.sg.lockd').exists()).toBe(false);
      expect(w.find('[data-testid="intro-load-detail"]').exists()).toBe(false);
      await press(w, 'End');
      expect(beat(w)).toBe('landfall');
    });
  });

  describe('pause', () => {
    it('shows the centre play symbol and opens the bar; clicking the symbol resumes', async () => {
      const w = await mountIntro();
      expect(w.find('[data-testid="intro-center-play"]').exists()).toBe(false);
      await w.get('[data-testid="intro-pause"]').trigger('click');
      expect(w.get('.bar').classes()).toContain('expanded');
      const play = w.get('[data-testid="intro-center-play"]');
      expect(play.attributes('aria-label')).toBe('Resume');
      await play.trigger('click');
      expect(w.find('[data-testid="intro-center-play"]').exists()).toBe(false);
      expect(w.get('.bar').classes()).not.toContain('expanded');
      expect(w.get('[data-testid="intro-pause"]').attributes('aria-pressed')).toBe('false');
    });

    it('a seek while paused stays paused', async () => {
      const w = await mountIntro();
      await w.get('[data-testid="intro-pause"]').trigger('click');
      await press(w, 'PageDown');
      expect(beat(w)).toBe('prophecy');
      expect(w.get('[data-testid="intro-pause"]').attributes('aria-pressed')).toBe('true');
      expect(w.find('[data-testid="intro-center-play"]').exists()).toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(beat(w)).toBe('prophecy');
    });

    it('a drag pauses the run and its voice without the centre symbol, and letting go resumes it', async () => {
      const w = await mountIntro();
      const hit = slider(w).element;
      vi.spyOn(w.get('.track').element, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 1000, right: 1000, top: 0, bottom: 3, height: 3, x: 0, y: 0, toJSON: () => ({}) });
      await pointer(hit, 'pointerdown', { clientX: 200 });
      expect(root(w).attributes('data-voice-state')).toBe('paused');
      expect(w.find('[data-testid="intro-center-play"]').exists()).toBe(false);
      expect(w.get('.bar').classes()).toContain('expanded');
      await vi.advanceTimersByTimeAsync(60_000);
      const dragged = beat(w);
      expect(dragged).not.toBe('fire');
      await pointer(hit, 'pointerup');
      expect(root(w).attributes('data-voice-state')).toBe('playing');
      expect(w.get('[data-testid="intro-pause"]').attributes('aria-pressed')).toBe('false');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(beat(w)).not.toBe(dragged);
    });

    it('a drag does not restart the voice clip on every move, only once where it lets go', async () => {
      const w = await mountIntro();
      const hit = slider(w).element;
      vi.spyOn(w.get('.track').element, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 1000, right: 1000, top: 0, bottom: 3, height: 3, x: 0, y: 0, toJSON: () => ({}) });
      const enterBeat = vi.spyOn(IntroVoice.prototype, 'enterBeat');
      await pointer(hit, 'pointerdown', { clientX: 100 });
      for (const x of [150, 250, 400, 550]) await pointer(hit, 'pointermove', { clientX: x });
      expect(beat(w)).not.toBe('fire'); // the moves did seek
      expect(enterBeat).not.toHaveBeenCalled();
      await pointer(hit, 'pointerup', { clientX: 550 });
      expect(enterBeat).toHaveBeenCalledTimes(1);
      enterBeat.mockRestore();
      expect(root(w).attributes('data-voice-beat')).toBe(beat(w));
      expect(root(w).attributes('data-voice-state')).toBe('playing');
    });

    it('a drag that starts on a paused run leaves it paused', async () => {
      const w = await mountIntro();
      await w.get('[data-testid="intro-pause"]').trigger('click');
      const hit = slider(w).element;
      vi.spyOn(w.get('.track').element, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 1000, right: 1000, top: 0, bottom: 3, height: 3, x: 0, y: 0, toJSON: () => ({}) });
      await pointer(hit, 'pointerdown', { clientX: 500 });
      await pointer(hit, 'pointerup');
      expect(w.get('[data-testid="intro-pause"]').attributes('aria-pressed')).toBe('true');
      expect(w.find('[data-testid="intro-center-play"]').exists()).toBe(true);
    });

    it('a click on the timeline does not also pause the scene', async () => {
      const w = await mountIntro();
      await slider(w).trigger('click');
      expect(root(w).classes()).not.toContain('is-paused');
    });
  });

  describe('switching scenes', () => {
    it('a seek swaps scene and narration without a crossfade; a beat that ends on its timer fades', async () => {
      const w = await mountIntro();
      const layerFade = () => w.get('transition-stub[name="intro-fade"]').attributes('css');
      const narrationFade = () => w.findAll('transition-stub').map((t) => t.attributes('name'));
      expect(layerFade()).toBe('true');
      expect(narrationFade()).toContain('intro-fade');
      const layer = w.get('.beat-layer').element;
      await press(w, 'PageDown');
      expect(w.get('.beat-layer').element).not.toBe(layer);
      expect(w.findAll('.beat-layer')).toHaveLength(1);
      expect(layerFade()).toBe('false');
      expect(narrationFade()).toContain('intro-instant');
      await vi.advanceTimersByTimeAsync(at('prophecy').durMs);
      expect(beat(w)).toBe('sending');
      expect(layerFade()).toBe('true');
      expect(narrationFade()).not.toContain('intro-instant');
    });

    it('a seek within the same beat keeps the scene mounted (its animations move instead)', async () => {
      const w = await mountIntro();
      const layer = w.get('.beat-layer').element;
      await press(w, 'ArrowRight');
      expect(beat(w)).toBe('fire');
      expect(w.get('.beat-layer').element).toBe(layer);
    });
  });

  describe('animations follow the seek', () => {
    type FakeAnim = { name: string; currentTime: number | null };
    let cache: WeakMap<Element, FakeAnim[]>;
    beforeEach(() => {
      cache = new WeakMap();
      // jsdom has no Web Animations: one animation per scene, and one more once the landfall plays on the longship
      (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = function (this: Element) {
        const list = cache.get(this) ?? [];
        if (!list.length) cache.set(this, list);
        if (list.length === 0) list.push({ name: 'ambient', currentTime: null });
        if (this.querySelector('.is-landfall') && !list.some((a) => a.name === 'coast')) list.push({ name: 'coast', currentTime: null });
        return list as unknown as Animation[];
      };
    });
    afterEach(() => {
      delete (Element.prototype as unknown as { getAnimations?: unknown }).getAnimations;
    });
    const anims = (w: VueWrapper) => cache.get(w.get('.beat-layer').element)!;

    it('sets every animation of the new scene to the offset into the beat', async () => {
      const w = await mountIntro();
      await press(w, 'ArrowRight');
      expect(anims(w).map((a) => a.currentTime)).toEqual([5000]);
      await press(w, 'PageDown');
      expect(anims(w).map((a) => a.currentTime)).toEqual([0]);
    });

    it('a landfall that shares the hold scene: the scene is timed to the hold plus the offset first, then the landfall animations start at the offset', async () => {
      const w = await mountIntro({ loaded: true });
      await press(w, 'PageDown', 4);
      expect(beat(w)).toBe('hold');
      expect(anims(w).map((a) => a.currentTime)).toEqual([0]);
      await press(w, 'ArrowRight', 2);
      expect(beat(w)).toBe('landfall');
      const offset = parseFloat((root(w).element as HTMLElement).style.getPropertyValue('--exit-offset'));
      expect(anims(w).map((a) => [a.name, a.currentTime])).toEqual([
        ['ambient', at('hold').durMs + offset],
        ['coast', offset],
      ]);
      expect(w.find('.longship').classes()).toContain('is-landfall');
    });

    it('a seek to the hold starts the scene at the offset, without the landfall', async () => {
      const w = await mountIntro();
      await press(w, 'End');
      expect(anims(w).map((a) => [a.name, a.currentTime])).toEqual([['ambient', at('hold').durMs]]);
      expect(w.find('.longship').classes()).not.toContain('is-landfall');
    });
  });

  describe('load list', () => {
    it('lists voices, terrain and buildings with their counts while the bar is open, and moves the narration up', async () => {
      introLoad.terrain = { loaded: 3, total: 9 };
      introLoad.buildings = { loaded: 0, total: 11 };
      introLoad.animations = { loaded: 2, total: 25 };
      const w = await mountIntro();
      expect(root(w).classes()).not.toContain('detail-open');
      await w.get('.bar').trigger('pointerenter');
      expect(root(w).classes()).toContain('detail-open');
      const rows = w.findAll('[data-testid="intro-load-detail"] .srow');
      expect(rows.map((r) => r.text())).toEqual(['Voices0/6', 'Terrain3/9', 'Buildings0/11', 'Animations2/25']);
      await w.get('.bar').trigger('pointerleave');
      expect(root(w).classes()).not.toContain('detail-open');
    });

    it('has no animations row while building animations are off (the group never reports)', async () => {
      introLoad.terrain = { loaded: 3, total: 9 };
      const w = await mountIntro();
      expect(w.findAll('[data-testid="intro-load-detail"] .srow').map((r) => r.attributes('data-group'))).toEqual(['voices', 'terrain', 'buildings']);
    });

    it('lists buildings from the start, as 0 of an unknown total until its first page reports', async () => {
      const w = await mountIntro();
      const row = (id: string) => w.get(`[data-testid="intro-load-detail"] .srow[data-group="${id}"] .ct`).text();
      expect(row('terrain')).toBe('0/?');
      expect(row('buildings')).toBe('0/?');
      introLoad.buildings = { loaded: 1, total: 11 };
      await flushPromises();
      expect(row('buildings')).toBe('1/11');
    });
  });

  describe('volume', () => {
    const volume = (w: VueWrapper) => w.get('[data-testid="intro-volume"]');
    const sound = (w: VueWrapper) => w.get('[data-testid="intro-sound"]');

    it('the range unmutes above 0 and mutes at 0; the speaker toggles and brings the level back', async () => {
      const w = await mountIntro();
      expect(sound(w).attributes('data-sound')).toBe('off');
      // muted, the range reads 0, so a step up starts from there
      await volume(w).trigger('keydown', { key: 'PageUp' });
      await flushPromises();
      expect(sound(w).attributes('data-sound')).toBe('on');
      expect(volume(w).attributes('aria-valuenow')).toBe('25');
      await sound(w).trigger('click');
      expect(sound(w).attributes('data-sound')).toBe('off');
      expect(volume(w).attributes('aria-valuenow')).toBe('0');
      await sound(w).trigger('click');
      expect(volume(w).attributes('aria-valuenow')).toBe('25');
      await volume(w).trigger('keydown', { key: 'Home' });
      expect(sound(w).attributes('data-sound')).toBe('off');
      await sound(w).trigger('click');
      expect(sound(w).attributes('data-sound')).toBe('on');
      expect(volume(w).attributes('aria-valuenow')).toBe('50');
    });

    it('the bar keeps its width: only the time, never the volume, changes the row', async () => {
      const w = await mountIntro();
      expect(w.find('.vpop').exists()).toBe(true);
      expect(w.get('.ctrl').element.children).toHaveLength(4);
    });
  });
});
