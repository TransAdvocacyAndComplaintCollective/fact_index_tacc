// eslint.config.js
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import css from "@eslint/css";
import unusedImports from "eslint-plugin-unused-imports";
import sonarjs from "eslint-plugin-sonarjs";
import cssModules from "eslint-plugin-css-modules";

export default defineConfig([
  globalIgnores(["**/*.scss", "**/*.test.js"]),

  sonarjs.configs.recommended,

  {
    files: ["**/*.css"],
    plugins: { css },
    rules: {
      // your CSS rules...
    },
  },

  // React hooks rules
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": ["warn", { additionalHooks: "^(useMyCustomHook)$" }],
    },
  },

  // JS/TS/React section
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: {
      js,
      tseslint,
      pluginReact,
      "unused-imports": unusedImports,
      cssModules,
    },
    extends: [
      "js/recommended",
      tseslint.configs.recommended,
      pluginReact.configs.flat.recommended,
    ],
    rules: {
      "@typescript-eslint/prefer-as-const": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "sonarjs/no-dead-store": "warn",
      "sonarjs/no-unused-collection": "warn",
      "sonarjs/no-useless-catch": "warn",
      // React-specific rules
      "react/button-has-type": "error",
      "react/jsx-no-target-blank": "error",
      "react/no-danger": "error",
      "react/no-unstable-nested-components": ["error", { allowAsProps: true }],
      "react/jsx-fragments": "error",
      // Core ESLint rule
      "no-await-in-loop": "error",
      // TypeScript ESLint extras for safety
      "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
    settings: {
      "css-modules": { basePath: "src", camelCase: true },
    },
  },
]);
