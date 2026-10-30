// @vitest-environment node
// The HUD's reduced-motion CSS keys off `html[data-hud-motion='reduced']`
// (see hudMotionAttribute.ts). Vue's scoped-style compiler silently DROPS
// everything after a `:global(...)` pseudo-class ( `:global(html) .x` compiles
// to a bare `html`), which would turn "still this one element" into "kill
// animations on <html>". Compile every SFC that uses the attribute and check
// each rule still ends in its own element selector.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse, compileStyle } from 'vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../..');

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return vueFiles(full);
    return name.endsWith('.vue') ? [full] : [];
  });
}

const users = vueFiles(SRC).filter((f) => readFileSync(f, 'utf8').includes('data-hud-motion'));

describe('data-hud-motion rules in SFCs', () => {
  it('found the components that use it', () => {
    expect(users.length).toBeGreaterThanOrEqual(11);
  });

  it.each(users)('%s keeps the element selector after the attribute', (file) => {
    const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });
    for (const style of descriptor.styles) {
      const { code } = compileStyle({ source: style.content, id: 'data-v-test', scoped: !!style.scoped, filename: file });
      const rules = [...code.matchAll(/([^{}]*data-hud-motion[^{}]*)\{/g)].map((m) => m[1]!.trim());
      for (const selector of rules) {
        for (const part of selector.split(',')) {
          expect(part.trim(), `${file}: "${part.trim()}"`).toMatch(/data-hud-motion=['"]?reduced['"]?\]\s+\S/);
        }
      }
    }
  });
});
