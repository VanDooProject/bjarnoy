// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { worldToScreen } from './camera';
import { badgeScreenRect, cssColor, labelPlaneOffset, MapLabelOverlay } from './mapLabelOverlay';
import { REALM_PILL } from './realmPill';

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('../motion', () => ({ prefersReducedMotion: () => reduced.value }));

const VIEWPORT = { width: 800, height: 600 };
const CAMERA = { x: 1234.5, y: -310.25, zoom: 0.85 };

function setup() {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  document.body.appendChild(host);
  const overlay = new MapLabelOverlay(canvas, 0.85);
  const root = host.querySelector<HTMLElement>('.map-labels')!;
  const plane = root.querySelector<HTMLElement>('.map-labels__plane')!;
  const els = () => Array.from(plane.querySelectorAll<HTMLElement>('[data-map-label]'));
  const find = (key: string) => plane.querySelector<HTMLElement>(`[data-map-label="${key}"]`);
  return { host, canvas, overlay, root, plane, els, find };
}

function frame(overlay: MapLabelOverlay, body: () => void) {
  overlay.beginFrame();
  body();
  overlay.endFrame();
}

beforeEach(() => {
  document.body.innerHTML = '';
  reduced.value = false;
});

describe('labelPlaneOffset', () => {
  it('offset + world * zoom is the world point on screen', () => {
    for (const dpr of [1, 2]) {
      const offset = labelPlaneOffset(CAMERA, VIEWPORT, dpr);
      for (const world of [{ x: 0, y: 0 }, { x: 5000, y: -3200 }, { x: 1234.5, y: -310.25 }]) {
        const screen = worldToScreen(CAMERA, world, VIEWPORT);
        expect(offset.x + world.x * CAMERA.zoom).toBeCloseTo(screen.x, 0);
        expect(offset.y + world.y * CAMERA.zoom).toBeCloseTo(screen.y, 0);
        expect(Math.abs(offset.x + world.x * CAMERA.zoom - screen.x)).toBeLessThanOrEqual(0.5 / dpr + 1e-9);
      }
    }
  });

  it('is rounded to a device pixel', () => {
    const { x, y } = labelPlaneOffset(CAMERA, VIEWPORT, 2);
    expect(x * 2).toBeCloseTo(Math.round(x * 2));
    expect(y * 2).toBeCloseTo(Math.round(y * 2));
  });
});

describe('badgeScreenRect', () => {
  it('is centred on the anchor both ways, scaled', () => {
    const r = badgeScreenRect({ x: 100, y: 200 }, { width: 120, height: 31.5 }, 2);
    expect(r.w).toBe(240);
    expect(r.h).toBe(63);
    expect(r.x + r.w / 2).toBe(100);
    expect(r.y + r.h / 2).toBe(200);
  });
});

describe('cssColor', () => {
  it('pads to six hex digits', () => {
    expect(cssColor(0x0000ff)).toBe('#0000ff');
    expect(cssColor(0xe8f0f5)).toBe('#e8f0f5');
  });
});

describe('MapLabelOverlay', () => {
  it('is inserted right after the canvas, inert and hidden from assistive tech', () => {
    const { canvas, root } = setup();
    expect(canvas.nextElementSibling).toBe(root);
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.getAttribute('data-testid')).toBe('map-labels');
    expect(root.classList.contains('map-labels')).toBe(true);
  });

  it('reuses an element per key across frames and rewrites the text only when it changed', () => {
    const { overlay, els, find } = setup();
    const show = (name: string) =>
      frame(overlay, () => overlay.badgeLabel('badge:a', { wx: 1, wy: 2, name, suffix: 'you · Lv 4', color: 0xff0000 }));
    show('Hafrsvik');
    const el = find('badge:a')!;
    const span = el.querySelector('.map-label__text')!;
    const spy = vi.spyOn(span, 'textContent', 'set');
    show('Hafrsvik');
    show('Hafrsvik');
    expect(spy).not.toHaveBeenCalled();
    show('Draugrvik');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(find('badge:a')).toBe(el);
    expect(els()).toHaveLength(1);
    expect(span.textContent).toBe('Draugrvik');
  });

  it('a badge is one element holding the name and the suffix', () => {
    const { overlay, find } = setup();
    frame(overlay, () => overlay.badgeLabel('badge:s', { wx: 0, wy: 0, name: 'Bjornstad', suffix: 'you · Lv 4', color: 0x00ff00 }));
    const texts = Array.from(find('badge:s')!.querySelectorAll('.map-label__text')).map((n) => n.textContent);
    expect(texts).toEqual(['Bjornstad', 'you · Lv 4']);
  });

  it('writes the anchor and the realm colour only when they change', () => {
    const { overlay, find } = setup();
    const draw = (wx: number, color: number) => frame(overlay, () => overlay.badgeLabel('badge:a', { wx, wy: 5, name: 'x', suffix: 'y', color }));
    draw(1, 0xff0000);
    const el = find('badge:a')!;
    const spy = vi.spyOn(el.style, 'setProperty');
    draw(1, 0xff0000);
    expect(spy).not.toHaveBeenCalled();
    draw(2, 0xff0000);
    expect(spy.mock.calls).toEqual([['--wx', '2']]);
    draw(2, 0x00ff00);
    expect(spy.mock.calls.at(-1)).toEqual(['--realm', '#00ff00']);
    expect(el.style.getPropertyValue('--wx')).toBe('2');
  });

  it('sizes the pill from REALM_PILL through custom properties', () => {
    const { overlay, find } = setup();
    frame(overlay, () => overlay.badgeLabel('badge:a', { wx: 0, wy: 0, name: 'x', suffix: 'y', color: 1 }));
    expect(find('badge:a')!.style.getPropertyValue('--pill-h')).toBe(String(REALM_PILL.badge.height));
    expect(find('badge:a')!.style.getPropertyValue('--pill-pad')).toBe(String(REALM_PILL.badge.padX));
    expect(find('badge:a')!.style.getPropertyValue('--pill-mark-r')).toBe(String(REALM_PILL.badge.markR));
    expect(find('badge:a')!.style.getPropertyValue('--pill-border')).toBe(String(REALM_PILL.badge.border));
  });

  it('writes the plane transform and --zoom only when they change', () => {
    const { overlay, plane } = setup();
    overlay.setPlane(CAMERA, VIEWPORT, 2);
    const { x, y } = labelPlaneOffset(CAMERA, VIEWPORT, 2);
    expect(plane.style.transform).toBe(`translate3d(${x}px, ${y}px, 0)`);
    expect(plane.style.getPropertyValue('--zoom')).toBe('0.85');
    const setProp = vi.spyOn(plane.style, 'setProperty');
    const transform = vi.spyOn(plane.style, 'transform', 'set');
    overlay.setPlane(CAMERA, VIEWPORT, 2);
    expect(setProp).not.toHaveBeenCalled();
    expect(transform).not.toHaveBeenCalled();
    overlay.setPlane({ ...CAMERA, x: CAMERA.x + 100 }, VIEWPORT, 2);
    expect(transform).toHaveBeenCalledTimes(1);
    expect(setProp).not.toHaveBeenCalled();
    overlay.setPlane({ ...CAMERA, x: CAMERA.x + 100, zoom: 1.2 }, VIEWPORT, 2);
    expect(setProp).toHaveBeenCalledWith('--zoom', '1.2');
  });

  it('hides keys not used this frame and removes them after the idle limit', () => {
    const { overlay, els, find } = setup();
    frame(overlay, () => {
      overlay.islandLabel('island:a', { wx: 0, wy: 0, text: 'a', mine: false, hidden: false });
      overlay.islandLabel('island:b', { wx: 0, wy: 0, text: 'b', mine: false, hidden: false });
    });
    expect(find('island:a')!.classList.contains('is-hidden')).toBe(false);
    frame(overlay, () => overlay.islandLabel('island:b', { wx: 0, wy: 0, text: 'b', mine: false, hidden: false }));
    expect(find('island:a')!.classList.contains('is-hidden')).toBe(true);
    expect(find('island:b')!.classList.contains('is-hidden')).toBe(false);
    for (let i = 0; i < 599; i++) frame(overlay, () => overlay.islandLabel('island:b', { wx: 0, wy: 0, text: 'b', mine: false, hidden: false }));
    expect(find('island:a')).not.toBeNull();
    frame(overlay, () => overlay.islandLabel('island:b', { wx: 0, wy: 0, text: 'b', mine: false, hidden: false }));
    expect(find('island:a')).toBeNull();
    expect(els()).toHaveLength(1);
  });

  it('writes a badge opacity only when it changes, and hides at zero', () => {
    const { overlay, find } = setup();
    const badge = () => overlay.badgeLabel('badge:s', { wx: 0, wy: 0, name: 'n', suffix: 's', color: 1 });
    let label = badge();
    label.setHidden(false);
    expect(find('badge:s')!.style.opacity).toBe('');
    label.setOpacity(0.4);
    expect(find('badge:s')!.style.opacity).toBe('0.4');
    const spy = vi.spyOn(find('badge:s')!.style, 'opacity', 'set');
    label.setOpacity(0.4);
    expect(spy).not.toHaveBeenCalled();
    label.setOpacity(1);
    expect(find('badge:s')!.style.opacity).toBe('');
    label = badge();
    label.setHidden(true);
    expect(find('badge:s')!.classList.contains('is-hidden')).toBe(true);
  });

  it('the ring alpha becomes the root opacity, written when it changes', () => {
    const { overlay, root } = setup();
    overlay.setOpacity(0.5);
    expect(root.style.opacity).toBe('0.5');
    const spy = vi.spyOn(root.style, 'opacity', 'set');
    overlay.setOpacity(0.5);
    expect(spy).not.toHaveBeenCalled();
    overlay.setOpacity(1);
    expect(root.style.opacity).toBe('');
  });

  it('an island label toggles its hidden class with the hidden flag, and marks the own island', () => {
    const { overlay, find } = setup();
    const island = (hidden: boolean, mine = false) =>
      frame(overlay, () => overlay.islandLabel('island:i', { wx: 0, wy: 0, text: 'ISLE', mine, hidden }));
    island(true);
    const el = find('island:i')!;
    expect(el.classList.contains('is-hidden')).toBe(true);
    island(false, true);
    expect(el.classList.contains('is-hidden')).toBe(false);
    expect(el.classList.contains('is-mine')).toBe(true);
    island(true);
    expect(el.classList.contains('is-hidden')).toBe(true);
    expect(el.textContent).toBe('ISLE');
  });

  it('the reduced-motion class follows prefersReducedMotion', () => {
    const { overlay, root } = setup();
    frame(overlay, () => undefined);
    expect(root.classList.contains('map-labels--still')).toBe(false);
    reduced.value = true;
    frame(overlay, () => undefined);
    expect(root.classList.contains('map-labels--still')).toBe(true);
    reduced.value = false;
    frame(overlay, () => undefined);
    expect(root.classList.contains('map-labels--still')).toBe(false);
  });

  it('is removed on destroy', () => {
    const { overlay, host } = setup();
    overlay.destroy();
    expect(host.querySelector('.map-labels')).toBeNull();
  });

  it('re-measures the pills on the next frame after a web font finished loading', () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    try {
      const { overlay, find } = setup();
      let width = 100;
      frame(overlay, () => {
        overlay.badgeLabel('badge:a', { wx: 0, wy: 0, name: 'Bjornstad', suffix: 'you', color: 0x3b82f6 });
      });
      Object.defineProperty(find('badge:a')!, 'offsetWidth', { get: () => width, configurable: true });
      let badge = overlay.badgeLabel('badge:a', { wx: 0, wy: 0, name: 'Bjornstad', suffix: 'you', color: 0x3b82f6 });
      // Unchanged text: the cached (fallback-font) size stays.
      expect(badge.width).toBe(0);
      width = 120;
      fonts.dispatchEvent(new Event('loadingdone'));
      frame(overlay, () => {
        badge = overlay.badgeLabel('badge:a', { wx: 0, wy: 0, name: 'Bjornstad', suffix: 'you', color: 0x3b82f6 });
      });
      expect(badge.width).toBe(120);
      overlay.destroy();
    } finally {
      delete (document as unknown as { fonts?: unknown }).fonts;
    }
  });
});
