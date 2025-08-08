// eslint.config.js
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint"; // includes plugin, parser, configs
import pluginReact from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import css from "@eslint/css";
import unusedImports from "eslint-plugin-unused-imports";
import sonarjs from "eslint-plugin-sonarjs";
import classnamesPlugin from "eslint-plugin-classnames";
import jespersCssModules from "@jespers/eslint-plugin-css-modules";

export default defineConfig([
  // 1. Ignore test files globally
  globalIgnores(["**/*.test.js"]),

  // 2. Core JS recommended rules
  js.configs.recommended,

  // 3. SonarJS recommended rules
  sonarjs.configs.recommended,

  // 4. CSS/SCSS files: only CSS modules linting
  {
    files: ["**/*.scss", "**/*.css"],
    plugins: {
    },
    rules: {
    },
  },

  // 5. Combined JS/TS/React block with full type-aware linting
  tseslint.config(
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      files: ["src/**/*.{js,jsx,ts,tsx}"],
      languageOptions: {
        globals: { ...globals.browser },
        parser: tseslint.parser, // correct parser object
        parserOptions: {
          project: true,
          tsconfigRootDir: __dirname,
          ecmaVersion: "latest",
          sourceType: "module",
        },
      },
      plugins: {
        js,
        tseslint,
        react: pluginReact,
        "react-hooks": reactHooks,
        "unused-imports": unusedImports,
        css,
        classnames: classnamesPlugin,
        // No sonarjs plugin here to avoid duplication
      },
      extends: [
        pluginReact.configs.flat.recommended
      ],
      rules: {
        // React Hooks
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": ["warn", { additionalHooks: "^(useMyCustomHook)$" }],
        // classnames
        "classnames/one-by-one-arguments": "error",
        "classnames/prefer-classnames-function": "warn",
        // Unused imports
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
        // SonarJS rules
        "sonarjs/no-dead-store": "warn",
        "sonarjs/no-unused-collection": "warn",
        "sonarjs/no-useless-catch": "warn",
        // React-specific rules
        "react/button-has-type": "error",
        "react/jsx-no-target-blank": "error",
        "react/no-danger": "error",
        "react/no-unstable-nested-components": ["error", { allowAsProps: true }],
        "react/jsx-fragments": "error",
        // Core ESLint
        "no-await-in-loop": "error",
        // TypeScript-specific rules
        "@typescript-eslint/prefer-as-const": "error",
        "@typescript-eslint/strict-boolean-expressions": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/consistent-type-imports": "error",
        // CSS Modules
      },
      settings: {
        "css-modules": { basePath: "src", camelCase: true },
      },
    }
  ),
]);
