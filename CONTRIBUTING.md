# Contributing to cascade-starter-kit

Thank you for helping. This repository holds the app a person starts from on
[cascade-runtime](https://github.com/jayostis/cascade-runtime-js): the template, the same app in a browser (`try/`),
the two add-ons (a chat with a model, and an MCP server), and `create-cascade-app`, the command that makes an app from
them. [`README.md`](README.md) names the parts, and [`CLAUDE.md`](CLAUDE.md) (with [`AGENTS.md`](AGENTS.md)) holds the
rules a change here follows; read it before you add a test or touch the runtime pin.

Report a security problem privately, by email to contact@cascadeprotocol.org, never in a public issue.

## Set up

You need Node.js 22.18 or newer and git.

```sh
git clone git@github.com:<you>/cascade-starter-kit.git
cd cascade-starter-kit
npm ci
```

Dependencies are pinned exactly. The one that matters most is the runtime: `app/package.json` pins
`cascade-runtime`, a `build-<sha>` pre-release of
[cascade-runtime-js](https://github.com/jayostis/cascade-runtime-js), and every test runs on it. Do not edit the pin by
hand. On a branch, `node scripts/pin.mjs <runtime-js commit>` moves it and `package-lock.json` together; commit the two
files and open a pull request, and its checks run on the new build.

## Run the tests

These are the commands CI runs:

```sh
npm run typecheck
npm run lint
npm test
```

`npm run format` fixes what the formatting check in `npm run lint` finds. Run all of the suite before you push;
pass node's own test flags through it to narrow a run, for example `npm test -- --test-name-pattern="<words>"`.

The browser tests, which run `try/` and the chat add-on in Chromium, are slower and need Playwright's browser, which you install once:

```sh
npx playwright install --only-shell chromium
npm run test:browser
```

## What a pull request must pass

CI runs on every pull request. This repository's policy is that a pull request is merged only when its checks are green.

- **`tests`**: the type check, the lint, and the suite. The results are then checked to read as a specification: every
  test sits under a capability heading listed in [`test/spec.json`](test/spec.json), word for word. That check runs in
  CI, not in `npm test`, so a new capability needs its heading added to `spec.json` by hand.
- **`node-22`**: the suite on Node 22, the oldest Node supported.
- **`pack`, `made` and `create`**: `pack` packs `create-cascade-app` with the template and its lockfiles. `made` and
  `create` then make an app by the command and use it; [`create.yml`](.github/workflows/create.yml) says which systems
  and add-ons each runs. A made app installs by `npm ci` from the lockfile the command ships, so a template change that
  leaves a lockfile out of step fails here.
- **`browser`**: builds `try/` and runs the browser tests.
- **`ready-to-merge`**: holds a pull request until every pull request it depends on can merge (see "A change that spans
  two repositories").

## Commits and pull requests

Use conventional commits: `feat(app): ...`, `fix(try): ...`. Why a change was made goes in its message, never in a
comment in the file.

Write the pull request description so a reader can tell what changed and why. Do not put a closing keyword (`closes`,
`fixes`, `resolves`) before an issue the pull request does not finish: GitHub closes it whatever the rest of the
sentence says.

## A change that spans two repositories

This repository reaches the runtime only through what the installed package exports. A need the exports do not meet is
a change in cascade-runtime-js first, and the two are a pair of pull requests. Each names the other in its description,
on a line of its own, with the full URL:

```
Depends-On: https://github.com/jayostis/cascade-runtime-js/pull/123
```

Use the full URL; the short `owner/repo#123` form is not read. While the runtime's pull request is open, every check here runs on the
package its own check packed at its head. When it merges, the pair moves the pin onto its build with `scripts/pin.mjs`
on the pair's branch, before the pair merges. Editing a description to add or cut a line re-runs the checks that read
it; if the named pull request changes after your checks have run, re-run yours with `gh run rerun`.

cascade-runtime-js's own check fails a named pull request that is from a fork, so a contributor without write access to
that repository asks a maintainer to open the counterpart.

The full rules are in cascade-bridge-spec's
[`compatibility.md`](https://github.com/jayostis/cascade-bridge-spec/blob/main/compatibility.md).

## Licence

Contributions are under the licence the repository states: Apache-2.0, in [`LICENSE`](LICENSE).
