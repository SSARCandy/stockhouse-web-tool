import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
        Notify: "readonly",
      },
      sourceType: "script",
    },
    rules: {
      "indent": ["error", 2],
      "no-unused-vars": "warn",
    },
  },
];
