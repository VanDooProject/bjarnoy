/**
 * Pictograms for the five resources (24x24 viewBox, filled with the resource
 * token). One place for the artwork; `ResourceIcon.vue` renders it.
 * Each glyph is the inner markup of the svg. `{mask}` is replaced with a
 * per-instance id by the component (the icon shows many times per page).
 */
export type ResourceKind = 'wood' | 'stone' | 'food' | 'iron' | 'pop';

export const RESOURCE_TOKENS: Record<ResourceKind, string> = {
  wood: 'var(--wood)',
  stone: 'var(--stone)',
  food: 'var(--food)',
  iron: 'var(--iron)',
  pop: 'var(--pop)',
};

export const RESOURCE_GLYPHS: Record<ResourceKind, string> = {
  wood: '<g transform="translate(-1.4 -0.4) rotate(-14 12 20)"><path fill-rule="evenodd" d="M7.6 7.4C7.2 11 7.9 15 7.4 19.6A4.6 1.6 0 0 0 16.6 19.6C17.1 15 16.4 11 16.8 7.4 14.8 9 9.6 9 7.6 7.4ZM9.5 10.4c.5 2.2-.3 4.4.2 7h1c-.5-2.6.3-4.8-.2-7ZM12.4 12c.4 1.8-.3 3.6.1 5.8h1c-.4-2.2.3-4-.1-5.8ZM14.4 9.6c.4 1.8-.2 3 .1 4.6h.9c-.3-1.6.3-2.8-.1-4.6Z"/><path fill-rule="evenodd" fill-opacity=".6" d="M7.6 6.3C7.6 4.2 16.8 4.2 16.8 6.3 16.8 8.3 7.6 8.3 7.6 6.3ZM9.4 6.3C9.4 5.1 15 5.1 15 6.3 15 7.5 9.4 7.5 9.4 6.3ZM10.6 6.3C10.6 5.6 13.8 5.6 13.8 6.3 13.8 7 10.6 7 10.6 6.3ZM11.8 6.3C11.8 6 12.6 6 12.6 6.3 12.6 6.6 11.8 6.6 11.8 6.3Z"/><g transform="translate(16.4 15.4) rotate(-30)"><path d="M-1 -1.2L4.6 -.55 4.6 .55 -1 1.3Z"/><path transform="translate(4.3 0) rotate(-44) scale(0.72)" d="M0 0C1.6 -3.4 6.2 -4.4 8.6 -3.2 7.6 .4 3.4 1.8 0 0Z"/><path transform="translate(4.3 0) rotate(36) scale(0.68)" d="M0 0C1.6 -3.4 6.2 -4.4 8.6 -3.2 7.6 .4 3.4 1.8 0 0Z"/></g></g>',
  stone:
    '<rect x="2" y="14.5" width="9.4" height="6.5" rx="0.6"/><rect x="12.6" y="14.5" width="9.4" height="6.5" rx="0.6"/><rect x="6.8" y="6" width="9.4" height="6.5" rx=".6" transform="rotate(-14 11.5 9.25)"/>',
  food: '<g transform="translate(-1.12 0) rotate(14 12 22)"><rect x="11.3" y="8" width="1.4" height="14.5" rx=".6"/><ellipse cx="12" cy="6" rx="1.7" ry="2.6"/><ellipse cx="9.7" cy="10.8" rx="1.6" ry="2.5" transform="rotate(-26 9.7 10.8)"/><ellipse cx="14.3" cy="10.8" rx="1.6" ry="2.5" transform="rotate(26 14.3 10.8)"/><ellipse cx="9.7" cy="16" rx="1.6" ry="2.5" transform="rotate(-26 9.7 16)"/><ellipse cx="14.3" cy="16" rx="1.6" ry="2.5" transform="rotate(26 14.3 16)"/></g>',
  iron: '<mask id="{mask}" maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28"><rect x="-2" y="-2" width="28" height="28" fill="#fff"></rect><path d="M3.8 14.4H11.4L13.6 20.4M11.4 14.4L19.8 7.8" fill="none" stroke="#000" stroke-width="1.15" stroke-linejoin="round"></path></mask><path d="M1.6 20.4L3.8 14.4L12.2 7.8H19.8L22 13.8L13.6 20.4Z" mask="url(#{mask})"/>',
  pop: '<circle cx="12" cy="7" r="4"/><path d="M4 21.5C4 15.6 7.6 13 12 13S20 15.6 20 21.5Z"/>',
};
