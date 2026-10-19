import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/", "build/"] },
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
            "ImportDeclaration[source.value!=/^(preact|preact\\/hooks|htm|preact-render-to-string)$/], ImportExpression",
          message:
            "The view runs in a browser too: it imports only preact, preact/hooks, htm and preact-render-to-string.",
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
            "ImportDeclaration[source.value!=/^(cascade-runtime|\\.\\/summary\\.mjs)$/], ImportExpression, ExportNamedDeclaration[source], ExportAllDeclaration",
          message:
            "PodApi runs in a browser too: it imports only cascade-runtime and ./summary.mjs, and re-exports nothing.",
        },
        {
          selector:
            'ImportDeclaration[source.value="cascade-runtime"] > ImportSpecifier[imported.name=/^(tablesBeside|loopbackSignIn|configureTables|finishSignIn|popupSignIn|appTables|checkTables|warm|podTitle|deletePod)$/]',
          message:
            "PodApi imports only what cascade-runtime exports in both conditions: not tablesBeside, loopbackSignIn, configureTables or the browser-only exports.",
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
