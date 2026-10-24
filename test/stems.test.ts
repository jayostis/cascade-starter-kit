import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { codeStems } from "cascade-runtime/terms";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("no source writes a code system's IRI stem: the starter reads each from the vocabulary", async () => {
  const sources = [
    ...(await readdir(join(ROOT, "app"), { recursive: true }))
      .map((name) => name.replaceAll("\\", "/"))
      .filter(
        (name) =>
          /\.(mjs|ts|tsx)$/.test(name) &&
          !/^(node_modules|dist|pods)\//.test(name),
      )
      .map((name) => `app/${name}`),
    ...(await readdir(join(ROOT, "add-ons"), { recursive: true }))
      .map((name) => name.replaceAll("\\", "/"))
      .filter((name) => /\.(ts|tsx)$/.test(name))
      .map((name) => `add-ons/${name}`),
    ...(await readdir(join(ROOT, "try", "build")))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `try/build/${name}`),
    ...(await readdir(join(ROOT, "create", "src")))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `create/src/${name}`),
  ];
  assert.ok(sources.includes("app/pod-api.ts"));
  assert.ok(sources.includes("app/said.ts"));
  assert.ok(sources.includes("app/src/pod.tsx"));
  assert.ok(sources.includes("add-ons/chat/server/chat.ts"));
  assert.ok(sources.includes("try/build/cli.ts"));
  assert.ok(sources.includes("create/src/create.ts"));
  const stems = Object.values(codeStems).map((stem) =>
    stem.replace(/^[a-z]+:\/\//, ""),
  );
  assert.ok(stems.length > 0, "the runtime names no code system's stem");
  const writing: string[] = [];
  for (const path of sources) {
    const text = await readFile(join(ROOT, path), "utf8");
    for (const stem of stems)
      if (text.includes(stem)) writing.push(`${path} writes ${stem}`);
  }
  assert.deepEqual(writing, []);
});
