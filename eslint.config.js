import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/", "**/dist-browser/", "build/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    files: ["app/said.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value!='cascade-runtime/terms'][source.value!='cascade-runtime'], ImportDeclaration[source.value='cascade-runtime'][importKind!='type'], ImportExpression, ExportNamedDeclaration[source], ExportAllDeclaration",
          message:
            "What the pages say runs everywhere, as plain functions: said.ts imports only the runtime's terms, and its types.",
        },
      ],
    },
  },
  {
    files: ["app/pod-api.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value!=/^(cascade-runtime|\\.\\/said\\.ts|\\.\\/server\\/inputs\\.ts)$/], ImportDeclaration[source.value='./server/inputs.ts'][importKind!='type'], ImportExpression, ExportNamedDeclaration[source], ExportAllDeclaration",
          message:
            "PodApi runs in a browser too: it imports only cascade-runtime and ./said.ts, the types of its inputs from ./server/inputs.ts, and re-exports nothing.",
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
    files: ["app/src/**/*.{ts,tsx}", "add-ons/*/src/**/*.{ts,tsx}"],
    ignores: ["app/src/hosts/browser.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value=/(^cascade-runtime$|pod-api\\.ts$)/][importKind!='type'], ImportExpression[source.value=/(^cascade-runtime$|pod-api\\.ts$)/]",
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
