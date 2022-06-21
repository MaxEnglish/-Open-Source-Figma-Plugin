module.exports = {
  env: {
    es6: true,
    browser: true,
    jasmine: true,
    node: true,
  },
  settings: {
    react: {
      pragma: "h",
      version: "detect",
    },
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
    project: ["tsconfig.eslint.json"],
    ecmaFeatures: {
      jsx: true,
    },
    extraFileExtensions: [".json"],
  },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:prettier/recommended",
  ],
  rules: {
    "@typescript-eslint/no-var-requires": 0,
  },
};
