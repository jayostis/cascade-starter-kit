# cascade-starter-kit — Agent Context

The app a person starts from on
[cascade-runtime](https://github.com/jayostis/cascade-runtime-js), and the
command that makes it; [`README.md`](README.md) names the parts. The contract is
the runtime's: its exports, its guide (`guide/AGENTS.md` in the installed
package) and the vocabulary behind it. This repository reaches the runtime only
through what the installed package exports.

## The pin

- **One pin: `app/package.json` `dependencies["cascade-runtime"]`,** the
  `cascade-runtime-*.tgz` of a runtime-js `build-<sha>` pre-release. Every test
  and try/ run on it, installed once at the root, and a made app runs on it
  unless `create --tarball` names another.
- **It moves by pull request,** never by hand on main:
  `node scripts/pin.mjs <runtime-js commit>` rewrites it and
  `package-lock.json`, and the checks run on the new build. `pin.yml` opens
  that pull request for runtime-js's newest build.
- **Nothing reaches into the package:** no `cascade-runtime/dist/…`, no
  `@cascade-runtime/*`, no runtime-js workspace path. A need the exports do not
  meet is a runtime-js change first.

## The reverse check

- **Coming (jayostis/cascade-runtime-js#453, step 5): every runtime-js pull
  request runs this repository's tests on its own fresh tarball** (a `check.yml`
  job that runtime-js's required `compatibility` job needs). Until it lands, a
  runtime-js change can break the starter unseen.
- **Coming with it: a breaking runtime change pairs by `Depends-On:`.** Its runtime-js PR body
  carries `Depends-On: jayostis/cascade-starter-kit#N`; the check then runs
  that PR's head instead of main. The runtime PR merges first, then the pair
  here moves the pin onto the new build.

## The freeze

- **This repository took its files, with their history, from runtime-js at
  `bf5c111`** (`git filter-repo`; `git log --follow` reaches back through it).
- **Until runtime-js deletes its copies (jayostis/cascade-runtime-js#454),** a
  runtime-js change to a moved path merges only once it is ported here.

## The rules

- **Bad input is a refusal, never a plain `Error` that escapes.** The app and
  PodApi throw `Refusal` from `cascade-runtime` for input they turn down: it
  writes nothing and says why. Any other error says the app is broken, never
  that an input was bad. Refusals are tested once, as a table of each input and
  the reason it is refused.
- **Tests assert meaning, never bytes.** Nothing compares bytes or whole files,
  and a test never names a run-dependent thing (an import, an entry session, a
  revision) by IRI.
- **Fewer, better, faster tests.** One test per behaviour, on the smallest input
  that shows it; before adding one, change the test that already shows the
  behaviour. Build a pod or a dataset once and share it.
- **The template is plain JavaScript.** `app/` is what a person gets; it imports
  only `cascade-runtime`, its `fixtures`, `@the-cascade-protocol/sandbox` and its
  own dependencies. The sandbox is not in `app/package.json`: here it resolves
  through the root's github devDependency, and `npm run build:create` bundles
  it into the template as `file:demo-hospital`. A made app never depends on
  git: `check/starter.mjs` checks its lock.

## create-cascade-app

- **Its own package and release.** `npm run build:create` packs `create/`
  with the template into `build/`; on main, `create.yml` publishes it as the
  pre-release `build-<sha>`, never the latest, and runs the command from it
  exactly as a person is told (`startLine(releaseAddress(sha), …)`).
- **No runtime dependency.** It loads a made app's tables and kits through
  that app's own `cascade-runtime/fixtures`, resolved from the app's folder
  once it is installed.

## Conventions

- Dependencies are pinned exactly.
- Conventional commits: `feat(app): ...`, `fix(try): ...`; why a change was
  made goes in its message, never in the file.
- No comment that restates a name, a type or another file.
