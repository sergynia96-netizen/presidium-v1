/**
 * Root ESLint config — framework-neutral.
 *
 * Shared base rules for all packages in the monorepo.
 * Framework-specific configs live in their respective apps/ packages/.
 *
 * apps/web/eslint.config.mjs  — Next.js rules (eslint-config-next)
 * apps/mobile/eslint.config.mjs — React/Vite rules (typescript-eslint)
 */

const eslintConfig = [{
  rules: {
    // ===========================================
    // Security rules - ENABLED
    // ===========================================
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",

    // ===========================================
    // General JavaScript rules - RELAXED
    // ===========================================
    "prefer-const": "warn",
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "no-debugger": "warn",
    "no-empty": "warn",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "warn",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  files: [
    "mini-services/relay-backend/**/*.ts",
  ],
  rules: {
    "no-console": "off",
  },
}, {
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "dist/**",
    "examples/**",
    "skills/**",
    "src/lib/crypto/**",
    "upload/**",
    "download/**",
    "*.config.js",
    "*.config.mjs",
    "*.config.ts",
  ]
}];

export default eslintConfig;
