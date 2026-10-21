# cascade-starter-kit

The app a person starts from on
[cascade-runtime](https://github.com/jayostis/cascade-runtime-js): the
template, the same app in a browser, and the command that makes one.

Status: a draft, as the runtime is. No compatibility is promised before a
numbered v1, and no claim is made that it is fit for clinical use.

## What is here

| Folder          | What it is                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`          | The template's base, a React app in TypeScript, on Node or in a browser alone. A made app is a copy of it; its `README.md` names its parts. |
| `add-ons/`      | The add-ons `create --with` adds to the base: `chat/` and `mcp/`, each its files, its tests and a shadcn `registry-item.json`.              |
| `try/`          | `try/build/`: the site Pages serves, the app's browser build at `try/` with the kits' samples beside it.                                    |
| `create/`       | `create-cascade-app`: copies the template, installs it and loads the four kits' pods. `pack.mjs` packs it with the demo hospital.           |
| `test/`         | The unit tests of the template, try/'s build and `create`.                                                                                  |
| `test-browser/` | try/ and the chat add-on in Chromium.                                                                                                       |
| `check/`        | `starter.ts`: a made app, end to end, as a person makes it.                                                                                 |

The template's pages are React with React Router, built by Vite. On Node,
`npm start` serves them from a [Hono](https://hono.dev) server that answers
PodApi at `/api/`; `npm run browser` builds the same app to run PodApi in the
page, which is what try/ is. Every file of it is TypeScript, and Node runs the
server and the commands as they are. The tools a model reaches, WebMCP and
each add-on's door alike, are one list with consent tiers (`app/tools.ts`).

## The base and the add-ons

The base is the UI, both hosts, the sample patients, the demo hospital, the
tool list with WebMCP, `npm run ask` and `npm test`. An add-on is a folder of
`add-ons/` whose `registry-item.json` has
[shadcn's registry-item shape](https://ui.shadcn.com/schema/registry-item.json):
its files (`path` from `add-ons/`, `target` in the app), its exactly pinned
`dependencies` and `devDependencies`, and in `meta` its npm scripts, their
lines in the app's `help.json` and the parts it adds to the app's `AGENTS.md`
and `README.md`, section by section. `create` applies it itself
(`addOn()` in `create/src/create.ts`), not through the shadcn CLI.

- `chat`: the chat with a model, on the [Vercel AI SDK](https://ai-sdk.dev)
  and [assistant-ui](https://www.assistant-ui.com), at `/chat` on the Node
  target, and `npm run model`.
- `mcp`: `npm run mcp`, an MCP server on stdio over the pods.

`create-cascade-app my-app --with chat,mcp` adds both; with no `--with`, a
person at a terminal is asked which to add, none by default. The base finds an
add-on by its files: `server/main.ts` serves `/chat` when `server/chat.ts` is
there, and the Node host draws the window when Vite finds `src/chat/window.tsx`;
without them `/chat` is a 404 and the screens draw no chat. The repository's
own suites run on `build/app/`, the template with every add-on added as
`create` adds them, which `npm test`, `npm run typecheck` and
`npm run test:browser` make first (`scripts/with-add-ons.mjs`); the root pins
each add-on's dependencies at the add-on's versions.

## The runtime it runs on

One pin, `app/package.json` `dependencies["cascade-runtime"]`: the tarball of a
runtime-js `build-<sha>` pre-release. It moves by pull request: on a branch,
`node scripts/pin.mjs <commit>`, commit `app/package.json` and
`package-lock.json`, and open a pull request. The tests, try/ and every made
app run on it.

## Making an app

Each commit on main is released as the pre-release `build-<sha>`; its notes
give the one line that makes an app from it:

```sh
npx --yes --package=https://github.com/jayostis/cascade-starter-kit/releases/download/build-<sha>/create-cascade-app-0.0.0-commit-<sha>.tgz create-cascade-app my-app
```

The made app installs from npm's registry and the runtime's tarball, with no
git.

Every runtime-js pull request runs this repository's tests on its own build (its
`starter-kit` job), so a runtime change that breaks the starter is seen before it
merges.

## Working on it

Node 22.18 or later, which runs the template's `.ts` files as they are.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build:create
```

Then, from a folder outside the repository,
`node <repository>/check/starter.ts <repository>/build/create-cascade-app-*.tgz`
makes an app from the packed command in a new folder under it and uses it as a
person would: its data through `/api`, its screens in Chromium (run
`npx playwright install --only-shell chromium` once); it takes minutes, and
stops at the first behaviour that fails. `--with chat,mcp` makes the app with
those add-ons. `--only <text>` checks only the behaviours whose name holds the
text, after those the others need. CI's `create` workflow runs the check on
the base on ubuntu and windows and with both add-ons on ubuntu, and makes the
base, `--with chat` and `--with mcp` on both systems to run their
`npm install && npm test`.

try/ in Chromium: `npm run build:try` writes `build/pages/` (try/, the four
samples, a root page that sends a visitor to try/), then `npm run test:browser`;
`npm run serve:pages` serves it as Pages does. Pages deploys it from main to
<https://jayostis.github.io/cascade-starter-kit/try/>.

[`AGENTS.md`](AGENTS.md) holds the rules a change follows.

## History

The files came from runtime-js at `bf5c111`, with their history;
`git log --follow` reaches back through the move.

## Licence

Apache-2.0; see [`LICENSE`](LICENSE).
