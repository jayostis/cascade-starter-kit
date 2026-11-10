import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("../../app/", import.meta.url));
/** The template, and the template with every add-on added. */
const APPS = [APP, fileURLToPath(new URL("../../build/app/", import.meta.url))];
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

describe("The app's AGENTS.md, against the app it describes", () => {
  describe("given the template, and the template with every add-on", () => {
    it('lists under "The starter" every npm script of `package.json`, and no other', async () => {
      for (const app of APPS) {
        const sections = sectionsOf(
          await readFile(join(app, "AGENTS.md"), "utf8"),
        );
        const starter = JSON.parse(
          await readFile(join(app, "package.json"), "utf8"),
        ) as { scripts: Record<string, string> };
        assert.deepEqual(
          sorted(
            itemsUnder(sections, "The starter").map((command) => {
              const script = /^npm (?:run (\S+)|(start|test))/.exec(command);
              assert.ok(script, `"${command}" runs no npm script`);
              return script[1] ?? script[2] ?? "";
            }),
          ),
          sorted(Object.keys(starter.scripts)),
          app,
        );
      }
    });

    it('names under "The starter" every `CASCADE_` variable the server reads', async () => {
      for (const app of APPS) {
        const sections = sectionsOf(
          await readFile(join(app, "AGENTS.md"), "utf8"),
        );
        const server = (
          await Promise.all(
            (await readdir(join(app, "server"))).map((name) =>
              readFile(join(app, "server", name), "utf8"),
            ),
          )
        ).join("\n");
        assert.match(
          server,
          /CASCADE_WORLD_DATE/,
          `the scan of ${app} finds no variable the server reads`,
        );
        const stated = (sections.get("The starter") ?? []).join("\n");
        for (const [, name] of server.matchAll(/env\.(CASCADE_[A-Z_]+)/g))
          assert.ok(
            stated.includes(`\`${name}\``),
            `no item under "The starter" names ${name}`,
          );
      }
    });
  });

  describe("given the template", () => {
    it("points at `guide/AGENTS.md`, a file the installed cascade-runtime ships", async () => {
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
  });
});
