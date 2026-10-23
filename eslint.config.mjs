/**
 * LAYERS — ESLint flat config (root).
 *
 * Why this file exists:
 *   Every package declares `"lint": "eslint ."` but ESLint was never declared as a
 *   dependency and no config file was ever committed. `eslint .` therefore resolved
 *   to whatever ESLint happened to be on PATH and died with
 *   "couldn't find an eslint.config.(js|mjs|cjs) file" — the lint gate was silently
 *   broken from the first commit, not failing on real code.
 *
 * Flat config is found by walking UP from each linted directory to the nearest
 * config, so a single root file covers every workspace package.
 *
 * Rules are deliberately the conservative core set (no stylistic opinions, no
 * type-aware rules that would need a project service). Anything that needs a
 * judgement call is a warning, not an error, so `eslint .` stays exit-0-clean.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.wrangler/**",
      "**/*.d.ts",
    ],
  },

  // Node-flavoured CJS scripts (Playwright helpers) — CommonJS, Node globals.
  {
    files: ["**/*.cjs", "**/*.cts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // TypeScript / browser application code.
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: tseslint.configs.recommended,
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
      globals: { ...globals.browser },
    },
    rules: {
      // `fn && fn(x)` is the codebase's intentional optional-callback idiom.
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // TS emits `declare` for these; the runtime value is not in scope.
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Plain JS (config files, scripts).
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
