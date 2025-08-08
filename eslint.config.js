// eslint.config.js at project root
import { defineConfig, FlatCompat } from "eslint/config";
import js from "@eslint/js";
import ts from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import globals from "globals";

const compat = new FlatCompat({ baseDirectory: __dirname });

// Shared config applied to all files:
const baseConfig = {
  files: ["**/*.{js,jsm,cjs,mjs,ts,tsx,cts,mts}"],
  ignores: ["**/node_modules/**"],
  languageOptions: {
    parser,
    parserOptions: {
      tsconfigRootDir: __dirname,
      project: true
    },
    ecmaVersion: "latest",
    sourceType: "module",
    globals: {
      ...globals.browser,
      ...globals.node
    }
  },
  plugins: {
    "@typescript-eslint": ts
  },
  rules: {
    // default rule set
    "no-unused-vars": "warn",
    "semi": ["error", "always"],
    ...compat.extends("eslint:recommended"),
    ...compat.extends("plugin:@typescript-eslint/recommended"),
    ...compat.extends("plugin:@typescript-eslint/recommended-requiring-type-checking")
  },
};

export default defineConfig([
  // global base
  baseConfig,

  // Backend-specific overrides
  {
    files: ["backend/**/*.{js,ts}"],
    rules: {
      // Example: stricter rules or additional backend-only rules
      "no-console": "warn"
    }
  },

  // Frontend-specific overrides
  {
    files: ["frontend/**/*.{js,ts,tsx}"],
    rules: {
      // Example: disable certain backend rules or add React-related rules
      "react/prop-types": "off"
    }
  }
]);
