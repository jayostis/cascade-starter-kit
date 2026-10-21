# cascade-starter-kit

The app a person starts from on
[cascade-runtime](https://github.com/jayostis/cascade-runtime-js): the
template, the same app in a browser, and the command that makes one.

Status: a draft, as the runtime is. No compatibility is promised before a
numbered v1, and no claim is made that it is fit for clinical use.

## What is here

| Folder          | What it is                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `app/`          | The template, a React app in TypeScript, on Node or in a browser alone. A made app is a copy of it; its `README.md` names its parts. |
| `try/`          | `try/build/`: the site Pages serves, the app's browser build at `try/` with the kits' samples beside it.                             |
| `create/`       | `create-cascade-app`: copies the template, installs it and loads the four kits' pods. `pack.mjs` packs it with the demo hospital.    |
| `test/`         | The unit tests of the template, try/'s build and `create`.                                                                           |
| `test-browser/` | try/ and the template's chat in Chromium.                                                                                            |
| `check/`        | `starter.ts`: a made app, end to end, as a person makes it.                                                                          |

The template's pages are React with React Router, built by Vite. On Node,
`npm start` serves them from a [Hono](https://hono.dev) server that answers
PodApi at `/api/` and the chat, on the [Vercel AI SDK](https://ai-sdk.dev) and
[assistant-ui](https://www.assistant-ui.com), at `/chat`; `npm run browser`
builds the same app to run PodApi in the page, which is what try/ is. Every
file of it is TypeScript, and Node runs the server and the commands as they
are. The tools a model reaches, MCP, the chat and WebMCP alike, are one list
with consent tiers (`app/tools.ts`).

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
stops at the first behaviour that fails. `--only <text>` checks only the
behaviours whose name holds the text, after those the others need.

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
