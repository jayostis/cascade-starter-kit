import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/", "**/dist-browser/", "build/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    files: ["try/**/*.js"],
    languageOptions: {
      globals: {
        AbortController: "readonly",
        document: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        history: "readonly",
        indexedDB: "readonly",
        location: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        window: "readonly",
      },
    },
  },
  {
    files: ["app/summary.mjs"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value!=/^(preact|preact\\/hooks|htm|preact-render-to-string|\\.\\/said\\.ts)$/], ImportExpression",
          message:
            "The view runs in a browser too: it imports only preact, preact/hooks, htm, preact-render-to-string and ./said.ts.",
        },
      ],
    },
  },
  {
    files: ["app/said.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration, ImportExpression, ExportNamedDeclaration[source], ExportAllDeclaration",
          message:
            "What the pages say runs everywhere, as plain functions: said.ts imports nothing.",
        },
      ],
    },
  },
  {
    files: ["app/pod-api.mjs"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value!=/^(cascade-runtime|\\.\\/said\\.ts)$/], ImportExpression, ExportNamedDeclaration[source], ExportAllDeclaration",
          message:
            "PodApi runs in a browser too: it imports only cascade-runtime and ./said.ts, and re-exports nothing.",
        },
        {
          selector:
            'ImportDeclaration[source.value="cascade-runtime"] > ImportSpecifier[imported.name=/^(tablesBeside|loopbackSignIn|configureTables|configureRuntime|entryVersion|finishSignIn|popupSignIn|appTables|checkTables|warm|podTitle|deletePod)$/]',
          message:
            "PodApi imports only what cascade-runtime exports in both conditions: not tablesBeside, loopbackSignIn, configureTables or the browser-only exports.",
        },
      ],
    },
  },
  {
    files: ["app/src/**/*.{ts,tsx}"],
    ignores: ["app/src/hosts/browser.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value=/(^cascade-runtime$|pod-api\\.mjs$|summary\\.mjs$)/], ImportExpression[source.value=/(^cascade-runtime$|pod-api\\.mjs$|summary\\.mjs$)/]",
          message:
            "The Node target's bundle carries no runtime: only src/hosts/browser.ts reaches cascade-runtime and PodApi in the page.",
        },
        {
          selector:
            "ImportDeclaration[source.value=/\\/server\\//][importKind!='type']",
          message:
            "The app reaches the server by its types only: `import type` from app/server/, so no server code enters the bundle.",
        },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
