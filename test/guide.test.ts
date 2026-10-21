import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("../../app/", import.meta.url));
const INSTALLED = fileURLToPath(
  new URL("../../package.json", import.meta.resolve("cascade-runtime")),
);

/** Each part of the document, by its heading, as its lines. */
function sectionsOf(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let heading = "the document's top";
  for (const line of text.split(/\r?\n/)) {
    const titled = /^#{2,} (.*)$/.exec(line);
    if (titled) {
      heading = titled[1] ?? "";
      sections.set(heading, []);
    } else sections.get(heading)?.push(line);
  }
  return sections;
}

/** The name each item of a section's lists starts with, in backticks or bold. */
function itemsUnder(
  sections: Map<string, string[]>,
  heading: string,
): string[] {
  const lines = sections.get(heading);
  assert.ok(lines, `there is no section "${heading}"`);
  return lines
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const name = /^- (?:`([^`]+)`|\*\*([^*]+)\*\*)/.exec(line);
      assert.ok(
        name,
        `an item under "${heading}" starts with no name: ${line}`,
      );
      return name[1] ?? name[2] ?? "";
    });
}

function sorted(names: Iterable<string>): string[] {
  return [...new Set(names)].sort();
}

test("the app's AGENTS.md lists the starter's scripts and the variables its server reads", async () => {
  const sections = sectionsOf(await readFile(join(APP, "AGENTS.md"), "utf8"));
  const starter = JSON.parse(
    await readFile(join(APP, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  assert.deepEqual(
    sorted(
      itemsUnder(sections, "The starter").map((command) => {
        const script = /^npm (?:run (\S+)|(start))/.exec(command);
        assert.ok(script, `"${command}" runs no npm script`);
        return script[1] ?? script[2] ?? "";
      }),
    ),
    sorted(Object.keys(starter.scripts)),
  );
  const server = (
    await Promise.all(
      (await readdir(join(APP, "server"))).map((name) =>
        readFile(join(APP, "server", name), "utf8"),
      ),
    )
  ).join("\n");
  assert.match(server, /CASCADE_WORLD_DATE/);
  const stated = (sections.get("The starter") ?? []).join("\n");
  for (const [, name] of server.matchAll(/env\.(CASCADE_[A-Z_]+)/g))
    assert.ok(
      stated.includes(`\`${name}\``),
      `no item under "The starter" names ${name}`,
    );
});

test("the starter's AGENTS.md points at the guide that ships", async () => {
  const agents = await readFile(join(APP, "AGENTS.md"), "utf8");
  const path = /node_modules\/cascade-runtime\/([^\s`]+)/.exec(agents)?.[1];
  assert.equal(path, "guide/AGENTS.md");
  const { files } = JSON.parse(await readFile(INSTALLED, "utf8")) as {
    files: string[];
  };
  assert.ok(files.includes(path), `the package's files leave out ${path}`);
  assert.ok(
    existsSync(join(INSTALLED, "..", path)),
    `the installed package holds no ${path}`,
  );
});
