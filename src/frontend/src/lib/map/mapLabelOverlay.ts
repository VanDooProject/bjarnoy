import type { Camera } from './camera';
import { IdleKeyedPool } from './idleKeyedPool';
import { prefersReducedMotion } from '../motion';
import { REALM_PILL, type RealmPillSize } from './realmPill';
import { OWN_REALM_COLOR } from './realmColours';
import './mapLabelOverlay.css';

/**
 * The map's text labels as DOM, so the glyphs stay sharp whatever resolution the canvas renders at. Owned and driven by
 * HexMapRenderer (every host gets it): the root sits right after the canvas, one plane inside it carries the camera
 * (`translate3d` + `--zoom`, written only when they change), and each label only carries its own world anchor
 * (`--wx` / `--wy`), which CSS turns into a position, so panning and zooming cost no per-label work.
 */

/** Frames a keyed label may stay unused before its element is removed. */
const LABEL_IDLE_FRAMES = 600;

type LabelKind = 'owner' | 'island' | 'badge';

/** Where the plane's top-left sits on screen, so that `offset + world * zoom` is `worldToScreen`; rounded to a device pixel. */
export function labelPlaneOffset(
  camera: Camera,
  viewport: { width: number; height: number },
  dpr: number,
): { x: number; y: number } {
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  return { x: snap(viewport.width / 2 - camera.x * camera.zoom), y: snap(viewport.height / 2 - camera.y * camera.zoom) };
}

/** `#rrggbb` of a 0xRRGGBB colour. */
export function cssColor(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/**
 * The settlement badge's outer screen rect (for the ring-occlusion test), given the screen point of its anchor, its
 * unscaled outer size and its zoom scale. The badge's bottom sits 10 (scaled) px above the anchor, plus half the border.
 */
export function badgeScreenRect(
  anchor: { x: number; y: number },
  size: { width: number; height: number },
  scale: number,
): { x: number; y: number; w: number; h: number } {
  const w = size.width * scale;
  const h = size.height * scale;
  const bottom = anchor.y + (REALM_PILL.badge.border / 2 - 10) * scale;
  return { x: anchor.x - w / 2, y: bottom - h, w, h };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Pointy-top hexagon (the one TopBar's logo and ResourceBar's icons use) or diamond, as unit-radius points around (0,0). */
function markPoints(mark: 'hex' | 'diamond'): string {
  if (mark === 'diamond') return '0,-1 1,0 0,1 -1,0';
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (-90 + 60 * i);
    points.push(`${+Math.cos(a).toFixed(4)},${+Math.sin(a).toFixed(4)}`);
  }
  return points.join(' ');
}

function createMark(mark: 'hex' | 'diamond'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-1 -1 2 2');
  svg.setAttribute('class', 'map-label__mark');
  const polygon = document.createElementNS(SVG_NS, 'polygon');
  polygon.setAttribute('points', markPoints(mark));
  svg.appendChild(polygon);
  return svg;
}

function applyPillSize(el: HTMLElement, size: RealmPillSize) {
  el.style.setProperty('--pill-h', String(size.height));
  el.style.setProperty('--pill-pad', String(size.padX));
  el.style.setProperty('--pill-mark-r', String(size.markR));
  el.style.setProperty('--pill-mark-gap', String(size.markGap));
  el.style.setProperty('--pill-label-gap', String(size.labelGap));
  el.style.setProperty('--pill-border', String(size.border));
}

/** One label element. Every write goes through a setter that skips unchanged values. */
export class MapLabel {
  readonly el: HTMLElement;
  /** Outer layout size in px (unscaled), measured when the text last changed; pills only. */
  width = 0;
  height = 0;
  private readonly texts: HTMLElement[];
  private lastTexts: string[];
  private wx = NaN;
  private wy = NaN;
  private hidden = true;
  private opacity = 1;
  private color = '';
  private mine = false;

  constructor(el: HTMLElement, texts: HTMLElement[]) {
    this.el = el;
    this.texts = texts;
    this.lastTexts = texts.map(() => '');
  }

  setAnchor(wx: number, wy: number) {
    if (wx !== this.wx) {
      this.wx = wx;
      this.el.style.setProperty('--wx', String(wx));
    }
    if (wy !== this.wy) {
      this.wy = wy;
      this.el.style.setProperty('--wy', String(wy));
    }
  }

  /** Sets the text of the `index`-th span; true when it changed. */
  setText(index: number, text: string): boolean {
    if (this.lastTexts[index] === text) return false;
    this.lastTexts[index] = text;
    this.texts[index].textContent = text;
    return true;
  }

  setColor(color: number) {
    const css = cssColor(color);
    if (css === this.color) return;
    this.color = css;
    this.el.style.setProperty('--realm', css);
  }

  setMine(mine: boolean) {
    if (mine === this.mine) return;
    this.mine = mine;
    this.el.classList.toggle('is-mine', mine);
  }

  setHidden(hidden: boolean) {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    this.el.classList.toggle('is-hidden', hidden);
  }

  setOpacity(opacity: number) {
    if (opacity === this.opacity) return;
    this.opacity = opacity;
    this.el.style.opacity = opacity === 1 ? '' : String(opacity);
  }

  /** Re-reads the element's layout size: one layout read, for when the text changed. */
  measure() {
    this.width = this.el.offsetWidth;
    this.height = this.el.offsetHeight;
  }
}

export class MapLabelOverlay {
  private readonly root: HTMLDivElement;
  private readonly plane: HTMLDivElement;
  private readonly pool = new IdleKeyedPool<MapLabel>(LABEL_IDLE_FRAMES);
  private planeX = NaN;
  private planeY = NaN;
  private zoom = NaN;
  private rootOpacity = 1;
  private still = false;
  /** Set when a web font finished loading: the pills' cached sizes were measured with the fallback font. */
  private fontsChanged = false;
  private readonly onFontsLoaded = () => {
    this.fontsChanged = true;
  };

  /**
   * Inserts the overlay right after `canvas`, in the canvas's own parent. `badgeZoomRef` is the zoom at and below which
   * the settlement badge keeps its size; above it the badge grows with the zoom.
   */
  constructor(canvas: HTMLCanvasElement, badgeZoomRef: number) {
    this.root = document.createElement('div');
    this.root.className = 'map-labels';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.setAttribute('data-testid', 'map-labels');
    this.root.style.setProperty('--badge-zoom-ref', String(badgeZoomRef));
    this.root.style.setProperty('--own-realm', cssColor(OWN_REALM_COLOR));
    this.plane = document.createElement('div');
    this.plane.className = 'map-labels__plane';
    this.root.appendChild(this.plane);
    canvas.insertAdjacentElement('afterend', this.root);
    document.fonts?.addEventListener('loadingdone', this.onFontsLoaded);
  }

  beginFrame() {
    const still = prefersReducedMotion();
    if (still !== this.still) {
      this.still = still;
      this.root.classList.toggle('map-labels--still', still);
    }
    this.pool.nextFrame();
    if (this.fontsChanged) {
      this.fontsChanged = false;
      this.pool.forEach((label) => label.measure());
    }
  }

  /** Labels not acquired this frame are hidden; ones unused for LABEL_IDLE_FRAMES frames are removed. */
  endFrame() {
    this.pool.sweep(
      (label) => label.setHidden(true),
      (label) => label.el.remove(),
    );
  }

  /** The camera, as the plane's transform and `--zoom`. */
  setPlane(camera: Camera, viewport: { width: number; height: number }, dpr: number) {
    const { x, y } = labelPlaneOffset(camera, viewport, dpr);
    if (x !== this.planeX || y !== this.planeY) {
      this.planeX = x;
      this.planeY = y;
      this.plane.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
    if (camera.zoom !== this.zoom) {
      this.zoom = camera.zoom;
      this.plane.style.setProperty('--zoom', String(camera.zoom));
    }
  }

  /** The ring-open fade: the whole overlay's opacity. */
  setOpacity(opacity: number) {
    const o = Math.round(opacity * 1000) / 1000;
    if (o === this.rootOpacity) return;
    this.rootOpacity = o;
    this.root.style.opacity = o === 1 ? '' : String(o);
  }

  /** World-map owner pill, centred on the world point (wx, wy). */
  ownerLabel(key: string, p: { wx: number; wy: number; text: string; color: number }): MapLabel {
    const label = this.acquire(key, 'owner');
    label.setAnchor(p.wx, p.wy);
    label.setColor(p.color);
    label.setHidden(false);
    if (label.setText(0, p.text)) label.measure();
    return label;
  }

  /** Island name, its top centre on the world point; `hidden` fades it out. */
  islandLabel(key: string, p: { wx: number; wy: number; text: string; mine: boolean; hidden: boolean }): MapLabel {
    const label = this.acquire(key, 'island');
    label.setAnchor(p.wx, p.wy);
    label.setMine(p.mine);
    label.setText(0, p.text);
    label.setHidden(p.hidden);
    return label;
  }

  /** Settlement badge (name + suffix), its bottom centre on the world point. The caller sets its visibility. */
  badgeLabel(key: string, p: { wx: number; wy: number; name: string; suffix: string; color: number }): MapLabel {
    const label = this.acquire(key, 'badge');
    label.setAnchor(p.wx, p.wy);
    label.setColor(p.color);
    const changedName = label.setText(0, p.name);
    const changedSuffix = label.setText(1, p.suffix);
    if (changedName || changedSuffix) label.measure();
    return label;
  }

  destroy() {
    document.fonts?.removeEventListener('loadingdone', this.onFontsLoaded);
    this.root.remove();
  }

  private acquire(key: string, kind: LabelKind): MapLabel {
    return this.pool.acquire(key, () => {
      const label = createLabel(kind);
      label.el.dataset.mapLabel = key;
      this.plane.appendChild(label.el);
      return label;
    });
  }
}

function createLabel(kind: LabelKind): MapLabel {
  const el = document.createElement('div');
  // Born hidden (as MapLabel starts), so an island label fades in the first time it shows.
  el.className = `map-label map-label--${kind} is-hidden`;
  if (kind === 'island') {
    return new MapLabel(el, [el]);
  }
  el.classList.add('map-label--pill');
  applyPillSize(el, kind === 'owner' ? REALM_PILL.owner : REALM_PILL.badge);
  el.appendChild(createMark(kind === 'owner' ? 'diamond' : 'hex'));
  const names = kind === 'owner' ? ['map-label__text'] : ['map-label__text map-label__text--badge-name', 'map-label__text map-label__text--badge-suffix'];
  const texts = names.map((className) => {
    const span = document.createElement('span');
    span.className = className;
    el.appendChild(span);
    return span;
  });
  return new MapLabel(el, texts);
}
