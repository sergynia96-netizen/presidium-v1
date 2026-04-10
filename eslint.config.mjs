import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // ===========================================
    // TypeScript rules - ENABLED for safety
    // ===========================================
    "@typescript-eslint/no-explicit-any": "warn",          // Warn about any types
    "@typescript-eslint/no-unused-vars": ["warn", {         // Warn about unused vars
      "argsIgnorePattern": "^_",
      "varsIgnorePattern": "^_"
    }],
    "@typescript-eslint/no-non-null-assertion": "warn",     // Warn on non-null assertions
    "@typescript-eslint/ban-ts-comment": "warn",            // Warn about ts-ignore
    "@typescript-eslint/prefer-as-const": "error",          // Prefer const over type assertion

    // ===========================================
    // React rules - ENABLED for safety
    // ===========================================
    "react-hooks/exhaustive-deps": "warn",                  // Warn about missing deps
    "react-hooks/purity": "warn",                           // Warn on impure renders
    "react/no-unescaped-entities": "off",                   // Allow unescaped entities
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // ===========================================
    // Next.js rules - ENABLED for safety
    // ===========================================
    "@next/next/no-img-element": "warn",                    // Warn about img without next/image
    "@next/next/no-html-link-for-pages": "error",           // Error on html links
    "@next/next/no-sync-scripts": "error",                  // Error on sync scripts

    // ===========================================
    // Security rules - ENABLED
    // ===========================================
    "no-eval": "error",                                     // Error on eval
    "no-implied-eval": "error",                             // Error on implied eval
    "no-new-func": "error",                                 // Error on new Function

    // ===========================================
    // General JavaScript rules - RELAXED
    // ===========================================
    "prefer-const": "warn",                                 // Warn when let can be const
    "no-unused-vars": "off",                                // Off (using TS rule)
    "no-console": ["warn", {                                // Warn on console.log, allow error/warn
      "allow": ["warn", "error"]
    }],
    "no-debugger": "warn",                                  // Warn on debugger
    "no-empty": "warn",                                     // Warn on empty blocks
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "warn",                               // Warn on fallthrough
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
