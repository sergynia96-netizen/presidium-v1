import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      "no-console": ["warn", { "allow": ["warn", "error"] }],
    },
  },
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "capacitor.config.ts",
    ],
  },
);
