module.exports = {
  extends: [
    "stylelint-config-standard",
    "stylelint-config-recommended-scss"
  ],
  plugins: ["stylelint-scss"],
  customSyntax: "postcss-scss",
  rules: {
    "at-rule-no-unknown": null,
    "scss/at-rule-no-unknown": true,
    "selector-max-id": 1,
    "number-leading-zero": "always",
  },
  ignoreFiles: ["node_modules/**", "dist/**"],
};
