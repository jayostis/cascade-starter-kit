import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import {
  agentPrompt,
  create,
  type Fixtures,
  KITS,
  type Terminal,
} from "../create/src/create.js";
import { gone } from "./settled.js";

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
  name: string;
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
  await gone(parent);
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
  /** Whether each install was told the folder holds a lockfile to install from. */
  readonly locked: boolean[];
  text(): string;
} {
  const written: string[] = [];
  const done: string[] = [];
  const locked: boolean[] = [];
  return {
    out: (text) => written.push(text),
    err: (text) => written.push(text),
    install: async (folder, { locked: lockfile }) => {
      done.push(`install ${folder}`);
      locked.push(lockfile);
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
    locked,
    text: () => written.join(""),
  };
}

/** The folder of lockfiles `create` reads in place of the ones it carries: one per combination, each marked `for`. */
async function lockfiles(): Promise<string> {
  const locks = await mkdtemp(join(parent, "locks-"));
  for (const each of ["none", "chat", "mcp", "chat+mcp"])
    await writeFile(
      join(locks, `${each}.json`),
      JSON.stringify({
        name: "cascade-app",
        lockfileVersion: 3,
        packages: { "": { name: "cascade-app" } },
        for: each,
      }),
    );
  return locks;
}

/**
 * `create-cascade-app` copies the template into a new folder, installs its packages and loads the four kits' pods, so a
 * person has a running app with sample records in one command. What it cannot do it says, and it leaves an app that was
 * made in place.
 */
describe("Making an app · create-cascade-app <folder>", () => {
  describe("given a folder that is not there yet", () => {
    let folder: string;
    let terminal: ReturnType<typeof recording>;

    before(async () => {
      folder = join(parent, "my-app");
      terminal = recording();
      assert.equal(await create([folder], terminal), 0);
    });

    it("names the project after the folder in `package.json`", async () => {
      assert.equal((await madeOf(folder)).name, "my-app");
    });

    it("gives the app the template's dependencies as they are, the pinned cascade-runtime among them", async () => {
      const template = JSON.parse(
        await readFile(
          new URL("../../app/package.json", import.meta.url),
          "utf8",
        ),
      ) as { dependencies: Record<string, string> };
      assert.deepEqual(
        (await madeOf(folder)).dependencies,
        template.dependencies,
      );
    });

    it("leaves out the chat's and the MCP server's files and packages", async () => {
      for (const file of CHAT_AND_MCP)
        assert.ok(!existsSync(join(folder, file)), `the base holds ${file}`);
      const template = JSON.parse(
        await readFile(
          new URL("../../app/package.json", import.meta.url),
          "utf8",
        ),
      ) as { devDependencies: Record<string, string> };
      assert.deepEqual(
        Object.keys({
          ...(await madeOf(folder)).dependencies,
          ...template.devDependencies,
        })
          .filter((name) => OF_CHAT_AND_MCP.test(name))
          .sort(),
        [],
        "the base depends on the AI SDK or MCP",
      );
    });

    it("lists `pods/`, `.env`, `/dist/` and `/dist-browser/` in the app's `.gitignore`", async () => {
      const ignored = (
        await readFile(join(folder, ".gitignore"), "utf8")
      ).split(/\r?\n/);
      for (const entry of ["pods/", ".env", "/dist/", "/dist-browser/"])
        assert.ok(ignored.includes(entry), `.gitignore does not list ${entry}`);
    });

    it("installs the packages, then loads the four kits' pods into `pods/`, in the kits' order", () => {
      assert.deepEqual(terminal.done, [
        `install ${folder}`,
        `fixtures of ${folder}`,
        `load alex-rivera into ${join(folder, "pods", "alex-rivera")}`,
        `load priya-natarajan into ${join(folder, "pods", "priya-natarajan")}`,
        `load martin-okafor into ${join(folder, "pods", "martin-okafor")}`,
        `load tamsin-vale into ${join(folder, "pods", "tamsin-vale")}`,
      ]);
    });

    it("prints how to run the app (`npm start`, `npm run browser`, `npm run help`) and a prompt to give a coding agent", () => {
      for (const line of [
        "with the pods alex-rivera, priya-natarajan, martin-okafor and tamsin-vale.",
        "npm start",
        "npm run browser",
        "npm run help",
        agentPrompt("my-app"),
      ])
        assert.ok(terminal.text().includes(line), `it did not print ${line}`);
    });

    it("prints each pod as it loads, with the seconds it took", () => {
      assert.match(
        terminal.text(),
        /Loading the pod alex-rivera.*loaded in \d+\.\d s/,
      );
    });

    it("prints no `npx` command and no `pod:load`", () => {
      for (const line of ["npx ", "pod:load"])
        assert.ok(!terminal.text().includes(line), `it printed ${line}`);
    });
  });

  describe("when the reference tables are set up", () => {
    /** A tables set-up that reports three phases, or fails with "no room" after the second. */
    function tablesThat(fails: boolean) {
      const given: string[] = [];
      const terminal = recording(undefined, async (pods, phase) => {
        given.push(pods);
        await phase(
          "Reading the tables…",
          async () => 3,
          () => "3 versions",
        );
        await phase("Checking the feed…", async () => undefined);
        if (fails) throw new Error("no room");
        await phase("Listing the codes…", async () => undefined);
      });
      return { given, terminal };
    }

    it("sets up the tables beside `pods/` before the first pod loads, printing each phase with its seconds", async () => {
      const { given, terminal } = tablesThat(false);
      const folder = join(parent, "tables-set-up");
      assert.equal(await create([folder], terminal), 0);
      assert.deepEqual(given, [join(folder, "pods")]);
      const text = terminal.text();
      assert.match(text, /Reading the tables… 3 versions, \d+\.\d s\n/);
      assert.match(text, /Checking the feed… \d+\.\d s\n/);
      assert.match(text, /Listing the codes… \d+\.\d s\n/);
      assert.ok(
        text.indexOf("Listing the codes…") <
          text.indexOf("Loading the pod alex-rivera"),
        "a setup line came after the first kit's",
      );
      assert.equal(terminal.done.length, 2 + KITS.length, "the kits loaded");
    });

    it("prints why the tables could not be set up, and loads the pods all the same", async () => {
      const { terminal } = tablesThat(true);
      const folder = join(parent, "tables-fail");
      assert.equal(await create([folder], terminal), 0);
      const text = terminal.text();
      assert.match(text, /the app's tables could not be set up: no room/);
      assert.doesNotMatch(text, /Listing the codes…/);
      assert.ok(
        text.indexOf("Checking the feed…") <
          text.indexOf("Loading the pod alex-rivera"),
        "a setup line came after the first kit's",
      );
      assert.equal(terminal.done.length, 2 + KITS.length, "the kits loaded");
    });
  });

  describe("when a pod does not load", () => {
    let folder: string;
    let terminal: ReturnType<typeof recording>;
    let returned: number;

    before(async () => {
      folder = join(parent, "half-loaded");
      terminal = recording("priya-natarajan");
      returned = await create([folder], terminal);
    });

    it("removes what the failed load wrote into `pods/`", async () => {
      assert.deepEqual(await readdir(join(folder, "pods")), []);
    });

    it("prints which pod did not load and why, and names the three that did", () => {
      assert.match(
        terminal.text(),
        /the pod priya-natarajan did not load: the kit is broken/,
      );
      assert.match(
        terminal.text(),
        /with the pods alex-rivera, martin-okafor and tamsin-vale\./,
      );
    });

    it("returns 0", () => {
      assert.equal(returned, 0);
    });
  });

  describe("when the made app's fixtures cannot be loaded", () => {
    it("returns 1 with the app left made, and prints a hint to run `npm install` in it, then `npm run reset`", async () => {
      const terminal = {
        ...recording(),
        fixtures: async () => {
          throw new Error("no such export");
        },
      };
      const folder = join(parent, "no-fixtures");
      assert.equal(await create([folder], terminal), 1);
      assert.ok(existsSync(join(folder, "package.json")), "the app is gone");
      assert.match(terminal.text(), /could not be loaded: no such export/);
      assert.match(
        terminal.text(),
        /`npm install` in it, then `npm run reset`/,
      );
    });
  });

  describe("given a folder it cannot use", () => {
    /** What `create` does with `args`: it returns 2, says why, runs nothing, and leaves `parent` as it was. */
    async function refusesAndWritesNothing(args: string[], reason: RegExp) {
      const untouched = await readdir(parent, { recursive: true });
      const terminal = recording();
      assert.equal(await create(args, terminal), 2);
      assert.match(terminal.text(), reason);
      assert.deepEqual(terminal.done, []);
      assert.deepEqual(await readdir(parent, { recursive: true }), untouched);
    }

    for (const [title, args, reason] of [
      [
        "refuses a folder holding a file, writing nothing",
        () => [join(parent, "taken")],
        /not empty/,
      ],
      [
        "refuses a name with a capital letter, writing nothing",
        () => [join(parent, "My-app")],
        /no project name/,
      ],
      [
        "refuses a name with a space, writing nothing",
        () => [join(parent, "my app")],
        /no project name/,
      ],
    ] as const)
      it(title, async () => {
        const taken = join(parent, "taken");
        await mkdir(taken, { recursive: true });
        await writeFile(join(taken, "notes.txt"), "mine");
        await refusesAndWritesNothing([...args()], reason);
      });
  });

  describe("given a Node.js too old to run `.ts` files", () => {
    it("returns 2, makes nothing and says which Node.js to get, before 22.18 and, on line 23, before 23.6", async () => {
      for (const version of ["v22.17.1", "v23.5.0"]) {
        const folder = join(parent, `node-${version}`);
        const terminal = recording();
        assert.equal(
          await create([folder], { ...terminal, node: version }),
          2,
          version,
        );
        assert.ok(
          terminal
            .text()
            .includes(
              `This app needs Node.js 22.18 or later; you have ${version}. Get it from https://nodejs.org`,
            ),
          version,
        );
        assert.ok(!existsSync(folder), version);
        assert.deepEqual(terminal.done, [], version);
      }
    });

    it("makes the app on 22.18.0 and on 23.6.0", async () => {
      for (const version of ["v22.18.0", "v23.6.0"]) {
        const folder = join(parent, `node-${version}`);
        const terminal = recording();
        assert.equal(
          await create([folder], { ...terminal, node: version }),
          0,
          version,
        );
        assert.doesNotMatch(
          terminal.text(),
          /This app needs Node\.js/,
          version,
        );
        assert.ok(existsSync(folder), version);
        assert.ok(terminal.done.length > 0, version);
      }
    });
  });

  describe("with no folder and no terminal", () => {
    it("exits 2 with the usage line, asking nothing", async () => {
      const bin = fileURLToPath(
        new URL("../create/src/create-cli.js", import.meta.url),
      );
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
    });
  });
});

/**
 * The template's base has no model in it. An add-on, `chat` or `mcp`, is a folder of files with a manifest; `--with`
 * copies its files into the new app and adds its pinned packages and npm scripts, and nothing else.
 */
describe("Adding the chat and the MCP server to a new app · --with, terminal.choose(), terminal.model()", () => {
  describe("given `--with chat`, `--with mcp` and `--with chat,mcp`", () => {
    type App = {
      names: string[];
      folder: string;
      terminal: ReturnType<typeof recording>;
      manifests: Manifest[];
      made: Made;
    };
    let template: string;
    let base: Made;
    let apps: App[];

    before(async () => {
      template = join(parent, "with-none");
      assert.equal(await create([template], recording()), 0);
      base = await madeOf(template);
      apps = [];
      for (const names of [["chat"], ["mcp"], ["chat", "mcp"]]) {
        const folder = join(parent, `with-${names.join("-")}`);
        const terminal = recording();
        assert.equal(
          await create([folder, "--with", names.join(",")], terminal),
          0,
          names.join(","),
        );
        apps.push({
          names,
          folder,
          terminal,
          manifests: await Promise.all(names.map(manifestOf)),
          made: await madeOf(folder),
        });
      }
    });

    it("adds exactly the files the named add-ons' manifests list", async () => {
      const inBase = new Set(await filesOf(template));
      for (const { names, folder, manifests } of apps)
        assert.deepEqual(
          (await filesOf(folder)).filter((path) => !inBase.has(path)),
          manifests
            .flatMap(({ files }) => files.map(({ target }) => target))
            .sort(),
          `${names.join(",")}: the files added`,
        );
    });

    it("adds exactly the packages the manifests pin", () => {
      for (const { names, manifests, made } of apps)
        for (const kind of ["dependencies", "devDependencies"] as const) {
          const added = Object.entries(made[kind]).filter(
            ([name, version]) => base[kind][name] !== version,
          );
          const pins = manifests.flatMap((each) =>
            (each[kind] ?? []).map(pinOf),
          );
          assert.deepEqual(
            added.sort(),
            pins.sort(),
            `${names.join(",")}: ${kind}`,
          );
        }
    });

    it("appends the manifests' npm scripts after the template's, and prints each as a command", () => {
      for (const { names, manifests, made, terminal } of apps) {
        const scripts = manifests.flatMap(({ meta }) =>
          Object.keys(meta?.scripts ?? {}),
        );
        assert.deepEqual(
          Object.keys(made.scripts),
          [...Object.keys(base.scripts), ...scripts],
          names.join(","),
        );
        for (const script of scripts)
          assert.ok(
            terminal.text().includes(`npm run ${script}`),
            `the end does not name npm run ${script}`,
          );
      }
    });

    it("adds the chat's route, its window, the `ai` package and `npm run model` for `chat`, and no MCP server", () => {
      const { folder, made } = apps[0]!;
      assert.ok(existsSync(join(folder, "server", "chat.ts")));
      assert.ok(existsSync(join(folder, "src", "chat", "window.tsx")));
      assert.equal(typeof made.dependencies.ai, "string");
      assert.equal(made.scripts.model, "node model.ts");
      assert.ok(!existsSync(join(folder, "mcp.ts")));
      assert.ok(!existsSync(join(folder, "mcp-server.ts")));
    });

    it("adds `mcp-server.ts` and `npm run mcp` for `mcp`, and no `ai` package", () => {
      const { folder, made } = apps[1]!;
      assert.ok(existsSync(join(folder, "mcp-server.ts")));
      assert.equal(made.scripts.mcp, "node mcp.ts");
      assert.equal(made.dependencies.ai, undefined);
    });

    it("returns 2 for an add-on it does not know, naming the two there are, and writes nothing", async () => {
      const untouched = await readdir(parent, { recursive: true });
      const terminal = recording();
      assert.equal(
        await create(
          [join(parent, "unknown"), "--with", "chat,nope"],
          terminal,
        ),
        2,
      );
      assert.match(
        terminal.text(),
        /no add-on named nope: the add-ons are chat and mcp/,
      );
      assert.deepEqual(terminal.done, []);
      assert.deepEqual(await readdir(parent, { recursive: true }), untouched);
    });
  });

  describe("given a terminal and no `--with`", () => {
    it("asks once which add-ons to add, offering `chat` and `mcp`", async () => {
      const asked: string[][] = [];
      assert.equal(
        await create([join(parent, "chosen-once")], {
          ...recording(),
          choose: async (addOns) => {
            asked.push(addOns.map(({ name }) => name));
            return [];
          },
        }),
        0,
      );
      assert.deepEqual(asked, [["chat", "mcp"]]);
    });

    it("adds none when none is chosen, and the chat when it is chosen", async () => {
      for (const [answer, chat] of [
        [[], false],
        [["chat"], true],
      ] as const) {
        const folder = join(parent, `chosen-${answer.join("-") || "none"}`);
        assert.equal(
          await create([folder], {
            ...recording(),
            choose: async () => answer,
          }),
          0,
        );
        assert.equal(
          existsSync(join(folder, "server", "chat.ts")),
          chat,
          answer.join("-") || "none",
        );
      }
    });

    it("asks nothing when `--with` is given", async () => {
      let asked = 0;
      assert.equal(
        await create([join(parent, "chosen-flag"), "--with", "mcp"], {
          ...recording(),
          choose: async () => {
            asked += 1;
            return [];
          },
        }),
        0,
      );
      assert.equal(asked, 0, "it asked with --with given");
    });

    it("returns 2 for a chosen add-on it does not know, and makes no folder", async () => {
      const terminal = recording();
      assert.equal(
        await create([join(parent, "chosen-unknown")], {
          ...terminal,
          choose: async () => ["chat", "nope"],
        }),
        2,
      );
      assert.match(
        terminal.text(),
        /no add-on named nope: the add-ons are chat and mcp/,
      );
      assert.ok(!existsSync(join(parent, "chosen-unknown")));
    });
  });

  describe("given a terminal that can set up a model", () => {
    let counted = 0;
    /** `create --with chat` on a terminal whose `model` offer is `taken` or not, and the folders it was offered. */
    async function offered(taken: boolean) {
      const terminal = recording();
      const folders: string[] = [];
      const folder = join(parent, `model-${taken}-${(counted += 1)}`);
      const returned = await create([folder, "--with", "chat"], {
        ...terminal,
        model: async (made) => {
          folders.push(made);
          assert.equal(
            terminal.done.length,
            2 + KITS.length,
            "it offered once the pods were loaded",
          );
          return taken;
        },
      });
      return { folder, folders, returned, terminal };
    }

    it("offers a model once the pods are loaded, for an app made with the chat", async () => {
      for (const taken of [true, false]) {
        const { folder, folders, returned } = await offered(taken);
        assert.equal(returned, 0, `taken ${taken}`);
        assert.deepEqual(folders, [folder], `taken ${taken}`);
      }
    });

    it("prints how to connect a model later when the offer is not taken up", async () => {
      for (const taken of [true, false]) {
        const { terminal } = await offered(taken);
        assert.equal(
          terminal.text().includes("connects a model to the app's chat later"),
          !taken,
          `taken ${taken}`,
        );
      }
    });

    it("offers no model, and prints no `npm run model`, for an app with no chat", async () => {
      for (const args of [[], ["--with", "mcp"]]) {
        const terminal = recording();
        let called = 0;
        assert.equal(
          await create([join(parent, `no-model-${args.length}`), ...args], {
            ...terminal,
            model: async () => {
              called += 1;
              return false;
            },
          }),
          0,
        );
        assert.equal(called, 0, "it offered a model with no chat");
        assert.ok(
          !terminal.text().includes("npm run model"),
          "it named the model",
        );
      }
    });
  });
});

/**
 * The command carries a lockfile for each combination of add-ons, made when it was packed, and installs a new app from
 * the one that fits, so a fresh install takes exactly the versions that were tested. `--tarball` names another build of
 * cascade-runtime than the lockfiles were made with.
 */
describe("Installing a new app's packages · package-lock.json, --tarball", () => {
  describe("given the lockfiles the command carries", () => {
    const made: {
      app: string;
      lock: string;
      folder: string;
      terminal: ReturnType<typeof recording>;
    }[] = [];

    before(async () => {
      const locks = await lockfiles();
      for (const [given, lock] of [
        [[], "none"],
        [["chat"], "chat"],
        [["mcp", "chat"], "chat+mcp"],
        [["mcp"], "mcp"],
      ] as const) {
        const app = `lock-${lock.replace("+", "-")}`;
        const folder = join(parent, app);
        const terminal = recording();
        const args = given.length === 0 ? [] : ["--with", given.join(",")];
        assert.equal(await create([folder, ...args], terminal, locks), 0, lock);
        made.push({ app, lock, folder, terminal });
      }
    });

    it("copies the lockfile of the app's add-ons as its `package-lock.json`, named for the app", async () => {
      for (const { app, lock, folder } of made) {
        const file = JSON.parse(
          await readFile(join(folder, "package-lock.json"), "utf8"),
        ) as {
          name: string;
          packages: Record<string, { name: string }>;
          for: string;
        };
        assert.deepEqual(
          [file.for, file.name, file.packages[""]!.name],
          [lock, app, app],
        );
      }
    });

    it("installs from that lockfile, and says it installed with `npm ci`", () => {
      for (const { lock, terminal } of made) {
        assert.deepEqual(terminal.locked, [true], lock);
        assert.match(terminal.text(), /with npm ci./, lock);
      }
    });
  });

  describe("given `--tarball`", () => {
    it("writes an address as the app's cascade-runtime dependency, as given", async () => {
      const folder = join(parent, "tarball-url");
      assert.equal(
        await create([folder, "--tarball", ADDRESS], recording()),
        0,
      );
      assert.equal(
        (await madeOf(folder)).dependencies["cascade-runtime"],
        ADDRESS,
      );
    });

    it("writes a file as `file:` and its absolute path", async () => {
      const folder = join(parent, "tarball-file");
      assert.equal(
        await create([folder, "--tarball", "runtime.tgz"], recording()),
        0,
      );
      assert.equal(
        (await madeOf(folder)).dependencies["cascade-runtime"],
        `file:${resolve("runtime.tgz").replaceAll("\\", "/")}`,
      );
    });

    it("copies no lockfile, installs without one, and says why", async () => {
      const folder = join(parent, "lock-tarball");
      const terminal = recording();
      assert.equal(
        await create(
          [folder, "--tarball", ADDRESS],
          terminal,
          await lockfiles(),
        ),
        0,
      );
      assert.ok(!existsSync(join(folder, "package-lock.json")));
      assert.deepEqual(terminal.locked, [false]);
      assert.match(terminal.text(), /no lockfile.*--tarball/i);
    });
  });
});

describe("The add-ons' manifests, against their folders and the versions the repository tests", () => {
  it("finds every file of an add-on's folder to be one its manifest adds or merges", async () => {
    for (const name of ["chat", "mcp"]) {
      const manifest = (await manifestOf(name)) as Manifest & {
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

  it("finds each package an add-on pins at the version the root's `package.json` tests", async () => {
    const { devDependencies: tested } = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { devDependencies: Record<string, string> };
    for (const name of ["chat", "mcp"]) {
      const manifest = await manifestOf(name);
      for (const spec of [
        ...(manifest.dependencies ?? []),
        ...(manifest.devDependencies ?? []),
      ]) {
        const [pinned, version] = pinOf(spec);
        assert.equal(
          tested[pinned!],
          version,
          `the repository tests ${pinned}`,
        );
      }
    }
  });

  it("finds React, React DOM, Vite and TypeScript at the template's versions in the root's `package.json`", async () => {
    const { devDependencies } = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { devDependencies: Record<string, string> };
    const template = JSON.parse(
      await readFile(
        new URL("../../app/package.json", import.meta.url),
        "utf8",
      ),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const tested = { ...template.dependencies, ...template.devDependencies };
    for (const name of ["react", "react-dom", "vite", "typescript"])
      assert.equal(devDependencies[name], tested[name], name);
  });
});
