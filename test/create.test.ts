import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import {
  agentPrompt,
  create,
  type Fixtures,
  KITS,
  type Terminal,
} from "../create/src/create.js";

const ADDRESS =
  "https://example.org/releases/download/build-0/cascade-runtime-0.0.0.tgz";
/** The chat's and the MCP server's files, as a made app holds them with both added. */
const CHAT_AND_MCP = [
  "server/chat.ts",
  "models.ts",
  "model.ts",
  "src/chat",
  "mcp.ts",
  "mcp-server.ts",
];
const OF_CHAT_AND_MCP =
  /^(ai|@ai-sdk\/.+|@assistant-ui\/.+|@openrouter\/.+|@modelcontextprotocol\/.+)$/;

type Made = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
};
type Manifest = {
  name: string;
  dependencies?: string[];
  devDependencies?: string[];
  files: { path: string; target: string }[];
  meta?: { scripts?: Record<string, string> };
};

const madeOf = async (folder: string) =>
  JSON.parse(await readFile(join(folder, "package.json"), "utf8")) as Made;

/** Every file under `folder`, by its path from it with `/`, leaving out what create leaves out of the template. */
async function filesOf(folder: string): Promise<string[]> {
  return (await readdir(folder, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(folder.length + 1)
        .replaceAll("\\", "/"),
    )
    .filter(
      (path) =>
        !/^(node_modules|dist|dist-browser|pods|test-results)\//.test(path) &&
        path !== ".env",
    )
    .sort();
}

/** `name@version`'s two parts, a scope's `@` kept with the name. */
function pinOf(spec: string): [string, string] {
  const at = spec.lastIndexOf("@");
  return [spec.slice(0, at), spec.slice(at + 1)];
}

const manifestOf = async (name: string) =>
  JSON.parse(
    await readFile(
      new URL(`../../add-ons/${name}/registry-item.json`, import.meta.url),
      "utf8",
    ),
  ) as Manifest;

let parent: string;

before(async () => {
  parent = await mkdtemp(join(tmpdir(), "create-cascade-app-"));
});

after(async () => {
  await rm(parent, { recursive: true, force: true });
});

/**
 * A terminal that keeps what is written and records each install, the folder whose fixtures it gave and each load. The
 * install does nothing; the fixtures time and phase as the runtime's do, set up the tables with `tables` and load a kit
 * by doing nothing, but a load of `failing` writes into its folder, then rejects.
 */
function recording(
  failing?: string,
  tables: Fixtures["setUpTables"] = async () => undefined,
): Terminal & {
  readonly done: string[];
  text(): string;
} {
  const written: string[] = [];
  const done: string[] = [];
  return {
    out: (text) => written.push(text),
    err: (text) => written.push(text),
    install: async (folder) => {
      done.push(`install ${folder}`);
      return true;
    },
    fixtures: async (folder) => {
      done.push(`fixtures of ${folder}`);
      const { phaseOn, seconds } = await import("cascade-runtime/fixtures");
      return {
        phaseOn,
        seconds,
        setUpTables: tables,
        replayKit: async (kit, folder) => {
          if (kit === failing) {
            await mkdir(folder, { recursive: true });
            await writeFile(join(folder, "half"), "");
            throw new Error("the kit is broken");
          }
          done.push(`load ${kit} into ${folder}`);
        },
      };
    },
    done,
    text: () => written.join(""),
  };
}

test("given a folder, it makes the project and names it, with the template's packages, its pinned runtime among them, at the versions the repository tests, and says how to run it on Node and in a browser alone", async () => {
  const folder = join(parent, "my-app");
  const terminal = recording();
  assert.equal(await create([folder], terminal), 0);

  const manifest = JSON.parse(
    await readFile(join(folder, "package.json"), "utf8"),
  ) as { name: string; dependencies: Record<string, string> };
  const template = JSON.parse(
    await readFile(new URL("../../app/package.json", import.meta.url), "utf8"),
  ) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.equal(manifest.name, "my-app");
  for (const file of CHAT_AND_MCP)
    assert.ok(!existsSync(join(folder, file)), `the base holds ${file}`);
  assert.deepEqual(
    Object.keys({ ...manifest.dependencies, ...template.devDependencies })
      .filter((name) => OF_CHAT_AND_MCP.test(name))
      .sort(),
    [],
    "the base depends on the AI SDK or MCP",
  );
  const { devDependencies } = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { devDependencies: Record<string, string> };
  assert.deepEqual(manifest.dependencies, template.dependencies);
  const tested = { ...template.dependencies, ...template.devDependencies };
  for (const name of ["react", "react-dom", "vite", "typescript"])
    assert.equal(devDependencies[name], tested[name], name);
  const ignored = (await readFile(join(folder, ".gitignore"), "utf8")).split(
    /\r?\n/,
  );
  for (const entry of ["pods/", ".env", "dist/", "dist-browser/"])
    assert.ok(ignored.includes(entry), `.gitignore does not list ${entry}`);
  assert.deepEqual(terminal.done, [
    `install ${folder}`,
    `fixtures of ${folder}`,
    `load alex-rivera into ${join(folder, "pods", "alex-rivera")}`,
    `load priya-natarajan into ${join(folder, "pods", "priya-natarajan")}`,
    `load martin-okafor into ${join(folder, "pods", "martin-okafor")}`,
    `load tamsin-vale into ${join(folder, "pods", "tamsin-vale")}`,
  ]);
  for (const line of [
    "with the pods alex-rivera, priya-natarajan, martin-okafor and tamsin-vale.",
    "npm start",
    "npm run browser",
    "npm run help",
    agentPrompt("my-app"),
  ])
    assert.ok(terminal.text().includes(line), `it did not print ${line}`);
  for (const line of ["npx ", "pod:load"])
    assert.ok(!terminal.text().includes(line), `it printed ${line}`);
  assert.doesNotMatch(terminal.text(), /Reading|Checking|Listing/);
  assert.match(
    terminal.text(),
    /Loading the pod alex-rivera.*loaded in \d+\.\d s/,
  );
});

test("--tarball names the made app's runtime instead of the pin: an address as it is, a file by its absolute path", async () => {
  for (const [given, runtime] of [
    [ADDRESS, ADDRESS],
    ["runtime.tgz", `file:${resolve("runtime.tgz").replaceAll("\\", "/")}`],
  ] as const) {
    const folder = join(
      parent,
      `tarball-${given === ADDRESS ? "url" : "file"}`,
    );
    assert.equal(await create([folder, "--tarball", given], recording()), 0);
    const { dependencies } = JSON.parse(
      await readFile(join(folder, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    assert.equal(dependencies["cascade-runtime"], runtime);
  }
});

test("--with adds exactly each named add-on's files, pinned dependencies and commands, at the versions the repository tests, and the end names its commands", async () => {
  const template = join(parent, "with-none");
  assert.equal(await create([template], recording()), 0);
  const base = await madeOf(template);
  const { devDependencies: tested } = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { devDependencies: Record<string, string> };
  for (const names of [["chat"], ["mcp"], ["chat", "mcp"]]) {
    const folder = join(parent, `with-${names.join("-")}`);
    const terminal = recording();
    assert.equal(
      await create([folder, "--with", names.join(",")], terminal),
      0,
      names.join(","),
    );
    const manifests = await Promise.all(names.map(manifestOf));
    const made = await madeOf(folder);
    const before = new Set(await filesOf(template));
    assert.deepEqual(
      (await filesOf(folder)).filter((path) => !before.has(path)),
      manifests.flatMap(({ files }) => files.map(({ target }) => target)).sort(),
      `${names.join(",")}: the files added`,
    );
    for (const [kind, listed] of [
      ["dependencies", "dependencies"],
      ["devDependencies", "devDependencies"],
    ] as const) {
      const added = Object.entries(made[kind]).filter(
        ([name, version]) => base[kind][name] !== version,
      );
      const pins = manifests.flatMap((each) => (each[listed] ?? []).map(pinOf));
      assert.deepEqual(added.sort(), pins.sort(), `${names.join(",")}: ${kind}`);
      for (const [name, version] of pins)
        assert.equal(tested[name], version, `the repository tests ${name}`);
    }
    const scripts = manifests.flatMap(({ meta }) =>
      Object.keys(meta?.scripts ?? {}),
    );
    assert.deepEqual(Object.keys(made.scripts), [
      ...Object.keys(base.scripts),
      ...scripts,
    ]);
    for (const script of scripts)
      assert.ok(
        terminal.text().includes(`npm run ${script}`),
        `the end does not name npm run ${script}`,
      );
  }
  const chat = await madeOf(join(parent, "with-chat"));
  assert.ok(existsSync(join(parent, "with-chat", "server", "chat.ts")));
  assert.ok(existsSync(join(parent, "with-chat", "src", "chat", "window.tsx")));
  assert.equal(typeof chat.dependencies.ai, "string");
  assert.equal(chat.scripts.model, "node model.ts");
  assert.ok(!existsSync(join(parent, "with-chat", "mcp.ts")));
  const mcp = await madeOf(join(parent, "with-mcp"));
  assert.ok(existsSync(join(parent, "with-mcp", "mcp-server.ts")));
  assert.equal(mcp.scripts.mcp, "node mcp.ts");
  assert.equal(mcp.dependencies.ai, undefined);
});

test("every file of an add-on's folder is one its manifest adds or merges", async () => {
  for (const name of ["chat", "mcp"]) {
    const manifest = await manifestOf(name) as Manifest & {
      meta?: { merge?: Record<string, string> };
    };
    const folder = fileURLToPath(
      new URL(`../../add-ons/${name}`, import.meta.url),
    );
    assert.deepEqual(
      await filesOf(folder),
      [
        "registry-item.json",
        ...manifest.files.map(({ path }) => path.slice(name.length + 1)),
        ...Object.values(manifest.meta?.merge ?? {}).map((path) =>
          path.slice(name.length + 1),
        ),
      ].sort(),
      name,
    );
  }
});

test("the tables are set up first, each phase reported with its seconds before the first kit's line, and a failure leaves the kits to try", async () => {
  for (const fails of [false, true]) {
    let pods = "";
    const terminal = recording(undefined, async (given, phase) => {
      pods = given;
      await phase(
        "Reading the tables…",
        async () => 3,
        () => "3 versions",
      );
      await phase("Checking the feed…", async () => undefined);
      if (fails) throw new Error("no room");
      await phase("Listing the codes…", async () => undefined);
    });
    const folder = join(parent, `tables-${fails}`);
    assert.equal(await create([folder], terminal), 0);
    assert.equal(pods, join(folder, "pods"));
    const text = terminal.text();
    assert.match(text, /Reading the tables… 3 versions, \d+\.\d s\n/);
    assert.match(text, /Checking the feed… \d+\.\d s\n/);
    assert.equal(/Listing the codes… \d+\.\d s\n/.test(text), !fails);
    assert.equal(
      /the app's tables could not be set up: no room/.test(text),
      fails,
    );
    assert.ok(
      text.indexOf(fails ? "Checking the feed…" : "Listing the codes…") <
        text.indexOf("Loading the pod alex-rivera"),
      "a setup line came after the first kit's",
    );
    assert.equal(terminal.done.length, 2 + KITS.length, "the kits loaded");
  }
});

test("with no --with a terminal asks which add-ons to add, none by default, and names a chosen one it does not know", async () => {
  for (const [answer, chat] of [
    [[], false],
    [["chat"], true],
  ] as const) {
    const asked: string[][] = [];
    const folder = join(parent, `chosen-${answer.join("-") || "none"}`);
    assert.equal(
      await create([folder], {
        ...recording(),
        choose: async (addOns) => {
          asked.push(addOns.map(({ name }) => name));
          return answer;
        },
      }),
      0,
    );
    assert.deepEqual(asked, [["chat", "mcp"]]);
    assert.equal(existsSync(join(folder, "server", "chat.ts")), chat);
  }
  const terminal = recording();
  let asked = 0;
  assert.equal(
    await create([join(parent, "chosen-flag"), "--with", "mcp"], {
      ...terminal,
      choose: async () => {
        asked += 1;
        return [];
      },
    }),
    0,
  );
  assert.equal(asked, 0, "it asked with --with given");
  const unknown = recording();
  assert.equal(
    await create([join(parent, "chosen-unknown")], {
      ...unknown,
      choose: async () => ["chat", "nope"],
    }),
    2,
  );
  assert.match(unknown.text(), /no add-on named nope: the add-ons are chat and mcp/);
  assert.ok(!existsSync(join(parent, "chosen-unknown")));
});

test("a terminal offers a model once the app is made with the chat, and says how to add one later when it is not taken up", async () => {
  for (const [taken, hint] of [
    [true, false],
    [false, true],
  ] as const) {
    const terminal = recording();
    const offered: string[] = [];
    const folder = join(parent, `model-${taken}`);
    assert.equal(
      await create([folder, "--with", "chat"], {
        ...terminal,
        model: async (made) => {
          offered.push(made);
          assert.equal(
            terminal.done.length,
            2 + KITS.length,
            "it offered once the pods were loaded",
          );
          return taken;
        },
      }),
      0,
    );
    assert.deepEqual(offered, [folder]);
    assert.equal(
      terminal.text().includes("connects a model to the app's chat later"),
      hint,
    );
  }
  for (const args of [[], ["--with", "mcp"]]) {
    const terminal = recording();
    let offered = 0;
    assert.equal(
      await create([join(parent, `no-model-${args.length}`), ...args], {
        ...terminal,
        model: async () => {
          offered += 1;
          return false;
        },
      }),
      0,
    );
    assert.equal(offered, 0, "it offered a model with no chat");
    assert.ok(!terminal.text().includes("npm run model"), "it named the model");
  }
});

test("a pod that does not load leaves the app made, and says which", async () => {
  const terminal = recording("priya-natarajan");
  const folder = join(parent, "half-loaded");
  assert.equal(await create([folder], terminal), 0);
  assert.deepEqual(await readdir(join(folder, "pods")), []);
  assert.match(
    terminal.text(),
    /the pod priya-natarajan did not load: the kit is broken/,
  );
  assert.match(
    terminal.text(),
    /with the pods alex-rivera, martin-okafor and tamsin-vale\./,
  );
});

test("an app whose fixtures cannot be loaded is left made, and the hint starts with npm install", async () => {
  const terminal = {
    ...recording(),
    fixtures: async () => {
      throw new Error("no such export");
    },
  };
  const folder = join(parent, "no-fixtures");
  assert.equal(await create([folder], terminal), 1);
  assert.match(terminal.text(), /could not be loaded: no such export/);
  assert.match(terminal.text(), /`npm install` in it, then `npm run reset`/);
});

test("it refuses a folder it cannot use and writes nothing", async () => {
  const taken = join(parent, "taken");
  await mkdir(taken);
  await writeFile(join(taken, "notes.txt"), "mine");
  const before = await readdir(parent, { recursive: true });
  const refusals: [string, string[], RegExp][] = [
    ["a folder holding a file", [taken], /not empty/],
    [
      "a name with a capital letter",
      [join(parent, "My-app")],
      /no project name/,
    ],
    ["a name with a space", [join(parent, "my app")], /no project name/],
    [
      "an add-on it does not know",
      [join(parent, "unknown"), "--with", "chat,nope"],
      /no add-on named nope: the add-ons are chat and mcp/,
    ],
  ];
  for (const [what, args, reason] of refusals) {
    const terminal = recording();
    assert.equal(await create(args, terminal), 2, what);
    assert.match(terminal.text(), reason, what);
    assert.deepEqual(terminal.done, [], what);
    assert.deepEqual(await readdir(parent, { recursive: true }), before, what);
  }
});

test("on a Node.js older than the first to run .ts files by default it makes nothing and says which to get; from that release on each line it makes the app", async () => {
  for (const [version, runs] of [
    ["v22.17.1", false],
    ["v23.5.0", false],
    ["v22.18.0", true],
    ["v23.6.0", true],
  ] as const) {
    const folder = join(parent, `node-${version}`);
    const terminal = recording();
    assert.equal(
      await create([folder], { ...terminal, node: version }),
      runs ? 0 : 2,
      version,
    );
    assert.equal(
      terminal
        .text()
        .includes(
          `This app needs Node.js 22.18 or later; you have ${version}. Get it from https://nodejs.org`,
        ),
      !runs,
      version,
    );
    assert.equal(existsSync(folder), runs, version);
    assert.equal(terminal.done.length > 0, runs, version);
  }
});

test("with no folder and no terminal it asks nothing", async () => {
  const bin = fileURLToPath(
    new URL("../create/src/create-cli.js", import.meta.url),
  );
  const started = Date.now();
  const { code, stderr } = await new Promise<{
    code: number | null;
    stderr: string;
  }>((done) => {
    const child = execFile(
      process.execPath,
      [bin],
      { timeout: 5000 },
      (_, __, stderr) => done({ code: child.exitCode, stderr }),
    );
  });
  assert.equal(code, 2);
  assert.match(stderr, /usage: create-cascade-app <folder>/);
  assert.ok(Date.now() - started < 1000, "it took a second or more");
});
