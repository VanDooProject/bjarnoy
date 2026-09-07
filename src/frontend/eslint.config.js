import vueParser from 'vue-eslint-parser';
import tsParser from '@typescript-eslint/parser';
import intlifyVueI18n from '@intlify/eslint-plugin-vue-i18n';

// Files with hardcoded template text that predate the i18n migration.
// Each extraction PR removes the file(s) it migrates from this list — don't
// add a *new* file here; a new component should be written with i18n from
// the start, which is exactly what this lint rule is for.
const LEGACY_UNMIGRATED_VUE_FILES = [
  'src/components/hud/DebugPanel.vue',
  'src/components/hud/FogDebugPanel.vue',
  'src/components/hud/FogPerfPanel.vue',
  'src/components/hud/WaterPerfPanel.vue',
];

export default [
  {
    ignores: ['dist/**', 'vendor/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    files: ['src/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tsParser, sourceType: 'module', ecmaVersion: 'latest' },
    },
    plugins: { '@intlify/vue-i18n': intlifyVueI18n },
    rules: {
      // Catches a hardcoded UI string landing in a template — the guardrail
      // this config exists for. Numbers/punctuation-only text (spacers,
      // separators, units already covered elsewhere) is allowed through so
      // the rule doesn't fire on template noise that was never going to be
      // translated anyway.
      '@intlify/vue-i18n/no-raw-text': [
        'error',
        { ignorePattern: '^[-–—•·:;,.!?()\\[\\]{}0-9\\s%/×→✕🔒]*$' },
      ],
    },
  },
  {
    // Legacy debt, not a free pass for new files — see the list's own
    // comment above.
    files: LEGACY_UNMIGRATED_VUE_FILES,
    rules: { '@intlify/vue-i18n/no-raw-text': 'off' },
  },
];
