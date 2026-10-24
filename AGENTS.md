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
- **It moves by pull request, by a local script,** never by hand on main. On a
  branch, `node scripts/pin.mjs <runtime-js commit>` (the commit of a
  `build-<sha>` pre-release, e.g. the newest of `gh release list -R
jayostis/cascade-runtime-js`) rewrites it and `package-lock.json`; it refuses
  a commit with no release and leaves both files as they were if the install
  fails. Commit the two files and open a pull request: its checks run on the
  new build.
- **Nothing reaches into the package:** no `cascade-runtime/dist/…`, no
  `@cascade-runtime/*`, no runtime-js workspace path. A need the exports do not
  meet is a runtime-js change first.

## The reverse check

- **Every runtime-js pull request runs this repository's tests on its own fresh
  tarball** (runtime-js's `starter-kit` job in `check.yml`, which its required
  `compatibility` job needs), so a runtime-js change that breaks the starter is
  seen before it merges.
- **A breaking runtime change pairs by `Depends-On:`.** Its runtime-js PR body
  carries `Depends-On: https://github.com/jayostis/cascade-starter-kit/pull/N`
  (the full URL; the short `owner/repo#N` form is rejected); the check then
  runs that PR's head instead of main. The runtime PR merges first, then the
  pair here moves the pin onto the new build.
- **The pair here names the runtime PR back** (`Depends-On:
https://github.com/jayostis/cascade-runtime-js/pull/N`). While that PR is
  open, every check here runs on the tarball its runtime-js check packed at its
  head (`.github/actions/runtime`), pinned in the checkout and never pushed;
  once it merges, the pin moves onto its build by `scripts/pin.mjs` on the
  pair's branch, before the pair merges.

## The freeze

- **This repository took its files, with their history, from runtime-js at
  `bf5c111`** (`git filter-repo`; `git log --follow` reaches back through it).
- **runtime-js no longer holds copies of the moved files,** so a change to one
  is made here only.

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
- **The template is TypeScript throughout.** `app/` is what a person gets: its
  pages are React, built by Vite, and every other file is a `.ts` that Node runs
  by type stripping, so the syntax is erasable only (`erasableSyntaxOnly`) and
  imports name `.ts` files. It imports only `cascade-runtime`, its `fixtures`,
  `@the-cascade-protocol/sandbox` and its own dependencies. The sandbox is not
  in `app/package.json`: here it resolves through the root's github
  devDependency, and `npm run build:create` bundles it into the template as
  `file:demo-hospital`. A made app never depends on git: `check/starter.ts`
  checks its lock. The root pins the packages it shares with the template
  (React, Vite, TypeScript) at the template's versions.

## create-cascade-app

- **Its own package and release.** `npm run build:create` packs `create/`
  with the template into `build/`; on main, `create.yml` publishes it as the
  pre-release `build-<sha>`, never the latest, and runs the command from it
  exactly as a person is told (`startLine(releaseAddress(sha), …)`).
- **No runtime dependency.** It loads a made app's tables and kits through
  that app's own `cascade-runtime/fixtures`, resolved from the app's folder
  once it is installed.
- **Add-ons are applied by `create`, not kept in `app/`.** The chat and the
  MCP server are `add-ons/chat/` and `add-ons/mcp/`, each with a shadcn
  `registry-item.json` that `create --with` applies (`addOn()`); the base never
  imports an add-on's module by name, it finds one by its files. A change to
  the chat or the MCP server is made in its add-on folder; the repository's
  suites see it through `build/app/` (`scripts/with-add-ons.mjs`), which
  `npm test`, `npm run typecheck` and `npm run test:browser` rebuild. An
  add-on's dependency is pinned in its manifest and at the same version in
  the root's devDependencies (`create.test.ts` checks it). An npm script it
  adds needs its line in `meta.help` and its item in its `AGENTS.part.md`
  under "The starter".

## Conventions

- Dependencies are pinned exactly.
- Conventional commits: `feat(app): ...`, `fix(try): ...`; why a change was
  made goes in its message, never in the file.
- No comment that restates a name, a type or another file.
