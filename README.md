# cascade-starter-kit

The app a person starts from on
[cascade-runtime](https://github.com/jayostis/cascade-runtime-js): the
template, the same app in a browser, and the command that makes one.

Status: a draft, as the runtime is. No compatibility is promised before a
numbered v1, and no claim is made that it is fit for clinical use.

## What is here

| Folder          | What it is                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `app/`          | The template: plain JavaScript, Preact and `htm`, no build step. A made app is a copy of it. Its `AGENTS.md` is the made app's own. |
| `try/`          | The app in a browser: the page, its host, and `try/build/`, which builds the page over the installed package.                       |
| `create/`       | `create-cascade-app`: copies the template, installs it and loads the four kits' pods. `pack.mjs` packs it with the demo hospital.   |
| `test/`         | The unit tests of the template, try/'s build and `create`.                                                                          |
| `test-browser/` | try/ and the template's chat in Chromium.                                                                                           |
| `check/`        | `starter.mjs`: a made app, end to end, as a person makes it.                                                                        |

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

Node 22 or later.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build:create
```

Then, from a folder outside the repository,
`node <repository>/check/starter.mjs <repository>/build/create-cascade-app-*.tgz`
makes an app from the packed command in a new folder under it and uses it as a
person would; it takes minutes.

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
