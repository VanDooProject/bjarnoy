import { describe, expect, it } from 'vitest';
import { buildPaletteReport, extractRgbKeys, extractRootTokenNames, toRgbKey } from '../../e2e/visual/palette';

describe('extractRootTokenNames', () => {
  it('reads custom properties from every :root block, themed and media-wrapped ones included', () => {
    const css = `
      /* --commented-out: red; */
      :root { --gold: #ffc55c; --panel-bg: rgba(10, 20, 27, 0.92); font-size: 16px; }
      body { --not-root: #fff; }
      :root[data-theme='light'] { --gold: #aa8800; --text: #111; }
      @media (min-width: 1600px) { :root { --scale: 1.2; } }
    `;
    expect(extractRootTokenNames(css)).toEqual(['--gold', '--panel-bg', '--text', '--scale']);
  });

  it('finds the tokens of the real style.css', async () => {
    const { readRootTokenNames } = await import('../../e2e/visual/palette');
    expect(readRootTokenNames()).toContain('--gold');
  });
});

describe('toRgbKey', () => {
  it('normalises computed colours and ignores alpha', () => {
    expect(toRgbKey('rgb(255, 197, 92)')).toBe('255,197,92');
    expect(toRgbKey('rgba(10, 20, 27, 0.92)')).toBe('10,20,27');
    expect(toRgbKey('color(srgb 1 0.5 0)')).toBe('255,128,0');
  });

  it('drops transparent and non-colour values', () => {
    expect(toRgbKey('rgba(0, 0, 0, 0)')).toBeNull();
    expect(toRgbKey('none')).toBeNull();
    expect(toRgbKey('url(#grad)')).toBeNull();
  });
});

describe('extractRgbKeys', () => {
  it('finds every colour in shadows and gradients', () => {
    expect(extractRgbKeys('rgba(0, 0, 0, 0.5) 0px 2px 4px 0px, rgb(255, 0, 0) 0px 0px 1px 0px')).toEqual(['0,0,0', '255,0,0']);
    expect(extractRgbKeys('linear-gradient(rgb(1, 2, 3), rgba(4, 5, 6, 0))')).toEqual(['1,2,3']);
  });
});

describe('buildPaletteReport', () => {
  it('matches colours to tokens by RGB, sorts by uses and counts the rest as off-palette', () => {
    const report = buildPaletteReport('landing', 'visual-desktop', {
      tokens: { '--gold': '255,197,92', '--also-gold': '255,197,92', '--size': null, '--text': '232,240,245' },
      colors: [
        { rgb: '1,2,3', uses: 2, samples: [{ selector: 'a', property: 'color' }] },
        { rgb: '255,197,92', uses: 9, samples: [] },
        { rgb: '232,240,245', uses: 4, samples: [] },
      ],
    });
    expect(report.tokens).toBe(3);
    expect(report.colors.map((c) => [c.rgb, c.token, c.uses])).toEqual([
      ['255,197,92', '--gold', 9],
      ['232,240,245', '--text', 4],
      ['1,2,3', null, 2],
    ]);
    expect(report.offPalette).toBe(1);
  });
});
