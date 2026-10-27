// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installWaapi } from '../../test/waapi';
import { DROPPING_ATTR, DROP_MS, HUB_OUT_MS, PULL_MS, openRing, retractRing, shake } from './ringMotion';

let waapi: ReturnType<typeof installWaapi>;

/** A ring as RingMenu renders it: hub and bubbles carry their centre in left/top. */
function ringDom(): HTMLElement {
  document.body.innerHTML = `
    <div class="ring-backdrop">
      <div class="ring-track" style="left:100px;top:100px"></div>
      <button class="ring-hub" style="left:200px;top:200px"></button>
      <button class="ring-bubble" id="a" style="left:260px;top:200px"></button>
      <button class="ring-bubble" id="b" style="left:200px;top:140px"></button>
      <button class="ring-bubble child" id="c" style="left:200px;top:80px"><span class="ring-badge"></span></button>
    </div>`;
  return document.querySelector<HTMLElement>('.ring-backdrop')!;
}

async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => (done = true));
  await Promise.resolve();
  await Promise.resolve();
  return done;
}

describe('ringMotion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    waapi = installWaapi();
  });
  afterEach(() => waapi.uninstall());

  describe('openRing (O1)', () => {
    it('grows the hub first, then blooms each lane-1 bubble out of the hub centre 35 ms apart', () => {
      const root = ringDom();
      void openRing(root);
      const hub = waapi.on('.ring-hub');
      expect(hub).toHaveLength(1);
      expect(hub[0].options).toMatchObject({ duration: 160, easing: 'cubic-bezier(.2,.9,.3,1.25)' });

      const bubbles = waapi.on('.ring-bubble');
      expect(bubbles.map((c) => c.el.id)).toEqual(['a', 'b']); // the outer lane (.child) is not part of opening
      // Each starts invisible, from the hub centre, shrunk.
      expect(bubbles[0].frames[0]).toMatchObject({ opacity: 0, transform: 'translate(-60px, 0px) scale(.3)' });
      expect(bubbles[0].options).toMatchObject({ duration: 240, delay: 160 });
      expect(bubbles[1].options.delay).toBe(160 + 35);
      // Never leaves a transform behind: a backwards fill, not forwards, or the hover lift would be blocked.
      expect(bubbles[0].options.fill).toBe('backwards');
    });

    it('does nothing under reduced motion', () => {
      waapi.uninstall();
      waapi = installWaapi(true);
      void openRing(ringDom());
      expect(waapi.calls).toHaveLength(0);
    });
  });

  describe('retractRing (X3)', () => {
    it('pulls the bubbles into the hub, then fades the hub, and only then resolves', async () => {
      const root = ringDom();
      const done = retractRing(root);
      const bubbles = waapi.on('.ring-bubble');
      expect(bubbles).toHaveLength(3);
      expect(bubbles[0].frames[1]).toMatchObject({ opacity: 0, transform: 'translate(-60px, 0px) scale(.3)' });
      expect(waapi.on('.ring-hub')).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(PULL_MS + 2 * 12 - 1);
      expect(await settled(done)).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      // Bubbles are in; the hub scales to .3 and fades.
      expect(waapi.on('.ring-hub')).toHaveLength(1);
      expect(waapi.on('.ring-hub')[0].frames[1]).toMatchObject({ opacity: 0, transform: 'scale(.3)' });
      expect(await settled(done)).toBe(false);
      await vi.advanceTimersByTimeAsync(HUB_OUT_MS);
      expect(await settled(done)).toBe(true);
    });

    it('makes the leaving ring click-through so a map drag can start at once', () => {
      const root = ringDom();
      void retractRing(root);
      expect(root.style.pointerEvents).toBe('none');
      expect(root.querySelector<HTMLElement>('.ring-bubble')!.style.pointerEvents).toBe('none');
    });

    it('drops the confirmed building onto the hex while the rest retract, then resolves', async () => {
      const root = ringDom();
      root.querySelector('#a')!.setAttribute(DROPPING_ATTR, '');
      const done = retractRing(root);
      const drop = waapi.on('#a')[0];
      expect(drop.options).toMatchObject({ duration: DROP_MS, easing: 'cubic-bezier(.5,0,.8,.4)' });
      expect(drop.frames[1]).toMatchObject({ transform: 'translate(-60px, 0px) scale(.35)' });
      // The others retract at the same time, not after.
      expect(waapi.on('#b')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(DROP_MS - 1);
      expect(await settled(done)).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await settled(done)).toBe(true);
    });

    it('resolves immediately under reduced motion', async () => {
      waapi.uninstall();
      waapi = installWaapi(true);
      const done = retractRing(ringDom());
      expect(await settled(done)).toBe(true);
      expect(waapi.calls).toHaveLength(0);
    });
  });

  describe('shake (X1)', () => {
    it('shakes with the translate property, wobbles the badge and flashes the reason', () => {
      document.body.innerHTML = '<button class="b"><span class="ring-badge"></span></button><ul class="reason"></ul>';
      const bubble = document.querySelector<HTMLElement>('.b')!;
      void shake(bubble, document.querySelector<HTMLElement>('.reason'));
      const own = waapi.on('.b');
      expect(own[0].frames.map((f) => f.translate)).toEqual(['0 0', '-5px 0', '5px 0', '-3px 0', '2px 0', '0 0']);
      expect(own[0].frames.every((f) => f.transform === undefined)).toBe(true);
      expect(own[0].options.duration).toBe(280);
      expect(waapi.on('.ring-badge')[0].frames.map((f) => f.transform)).toEqual(['rotate(0)', 'rotate(-28deg)', 'rotate(24deg)', 'rotate(0)']);
      expect(waapi.on('.ring-badge')[0].options.duration).toBe(300);
      const flash = waapi.on('.reason')[0];
      expect(flash.frames[0]).toMatchObject({ background: 'rgba(240,166,74,.35)' });
      expect(flash.options.duration).toBe(520);
    });

    it('under reduced motion only the reason flash remains', () => {
      waapi.uninstall();
      waapi = installWaapi(true);
      document.body.innerHTML = '<button class="b"><span class="ring-badge"></span></button><ul class="reason"></ul>';
      void shake(document.querySelector<HTMLElement>('.b')!, document.querySelector<HTMLElement>('.reason'));
      expect(waapi.calls.map((c) => c.el.className)).toEqual(['reason']);
    });
  });
});
