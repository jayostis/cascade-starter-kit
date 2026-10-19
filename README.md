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
| `create/`       | `create-cascade-app`: copies the template, installs it and loads the four kits' pods.                                               |
| `test/`         | The unit tests of the template, try/'s build and `create`.                                                                          |
| `test-browser/` | try/ and the template's chat in Chromium.                                                                                           |
| `check/`        | `starter.mjs`: a made app, end to end, as a person makes it.                                                                        |

## The runtime it runs on

One pin, `app/package.json` `dependencies["cascade-runtime"]`: the tarball of a
runtime-js `build-<sha>` pre-release. It moves by pull request. The tests and
try/ run on it; `create` still takes a made app's runtime from `--tarball`
until jayostis/cascade-starter-kit#2 (step 4) makes it the pin.

Coming with jayostis/cascade-runtime-js#453 (step 5): every runtime-js pull
request runs this repository's tests on its own build, so a runtime change that
breaks the starter is seen before it merges. Until then it is seen at the next
pin bump.

## Working on it

Node 22 or later.

```sh
npm ci
npm run typecheck
npm run lint
npm test
```

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
