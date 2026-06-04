import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/**
 * Configuración ESLint base (flat config) compartida por los paquetes TypeScript.
 * Los paquetes la extienden (p. ej. la web añade el plugin de Next).
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".next/**",
      "out/**",
      "coverage/**",
      "node_modules/**",
      "**/*.config.{js,cjs,mjs}",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
);
