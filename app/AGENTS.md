# For an agent building on this app

This app was made from the Cascade starter. It is a demonstration, not a
foundation: rebuild it in any framework. What carries over is
`cascade-runtime`, which keeps the pods, and the pods under `pods/<name>/`. It
starts with four, Alex Rivera's, Priya Natarajan's, Martin Okafor's (two
FHIR reports of one variant, beside what ClinVar says today) and Tamsin Vale's
(two pulls from Cascade North a year apart), loaded from the
kits the package carries; `npm run reset` puts them back as they were made, and
`npm run help` lists every command. The app is the starter's base; an add-on
that `create-cascade-app --with` added (the chat, the MCP server) has its own
section at the end of this file, and its commands are under "The starter".
`npm run kit:export -- alex-rivera x-e12` copies one of Alex's downloads into
the app as `apple_health_export`, and
`npm run kit:export -- priya-natarajan kestrel-harbor-health-summary.xml` one
of Priya's C-CDA files under its own name.

The app is TypeScript throughout. Its pages are one React app, `index.html`
and `src/`, routed by React Router and built by Vite (`vite.config.ts`, with
the plugin of `vite/cascade.ts`); every other file, the server and the
commands among them, is a `.ts` that Node runs as it is, with no build (Node
22.18 or later strips its types). `npm run typecheck` checks all of it. The
app has two targets:

- **On Node,** `npm start` builds it into `dist/` (again whenever a file it is
  built from is newer) and serves it from `server/main.ts` at
  `http://127.0.0.1:3000/`, over the pods in `pods/`; `npm run dev` serves the
  sources through Vite in the same process instead, the pages redrawn on every
  save. Its pages reach PodApi over HTTP: `src/hosts/http.ts` calls
  `POST /api/<operation>` through Hono's typed client (`src/hosts/remote.ts`),
  and `server/api.ts` answers it, each input checked by `server/inputs.ts`.
  `server/app.ts` is the server: the guard (`server/guard.ts`), `/api/`,
  `/tools`, `/callback`, `/world-date` and the built pages, and `/chat` when
  the chat is added (without it, `/chat` is a 404).
- **In a browser alone,** `npm run browser` (`server/browser.ts`) builds it
  with Vite's `browser` mode into `dist-browser/`, with the kits' samples that
  a first visit copies, and serves those files on 127.0.0.1; nothing answers
  `/api/`. Its pages run PodApi in the page: `src/hosts/browser.ts` calls
  `podApi` of `pod-api.ts` over `cascade-runtime`'s browser build, which the
  plugin copies beside the bundle with the demo hospitals' service worker, and
  the pods are kept in the browser's storage. It has no chat.

`src/main.tsx` picks the host by the build's mode and makes the router, React
Router in data mode (`createBrowserRouter`, `<RouterProvider>`), from the
routes of `App.tsx`. A screen reads in its route's `loader` and writes in its
route's `action`, both over the host's PodApi, knowing neither host. The
screens are in `src/`: `App.tsx` (the routes, and the shell around every
screen), `shell.tsx` (the title bar, the sidebar and the boxes), `pod.tsx` (a
pod's page), `entry.tsx`, `trend.tsx`, `classes.tsx`, `panel.tsx`,
`tables.tsx`, `hospitals.tsx` (bringing in a record, the world's date) and
`newpod.tsx` (a new pod, and an encrypted one's six words), with `parts.tsx`,
`chart.tsx`, `screen.tsx`, `actions.tsx`, `doing.ts`, `engine.ts`, `look.ts`
and `style.css`. What they say comes from `said.ts`: plain functions with no
imports, from a pod's question rows to what a page says. `addresses.ts` makes
every address; a screen never builds one. Rewrite any of it as you like.

**Reading.** Each screen's file has its loader (`podLoader`, `entryLoader`, …),
wrapped in `screen(…)` of `screen.tsx`, and its `…Screen`, which draws
`useRead()`, what the loader read, through a `…Page` that takes it as props.
The loader returns the screen's `value` and the tab's `title`; a `Refusal` it
meets is the screen's own "Not found", and an encrypted pod that will not open
its unlock screen, drawn at the address asked for. What the tables say comes
once the engine has warmed (`engine.ts`): while it warms, a loader hands the
screen a promise for it, which `useLate()` draws once it settles, the part
still to come marked `aria-busy` (`Pending` of `parts.tsx`) meanwhile.

**Writing.** Every route has one action, `steps(host)` of `actions.tsx`, and
a step is a form posted to the address shown: `PostButton` of `parts.tsx`, or
a `StepForm` with `StepFields`, whose `intent` names the step and `doing` says
what the page is doing while it runs. A step that moves the app returns the
router's `redirect` (with `leaveNote` for a note above the next screen); one
that stays returns nothing, and the router reads the screen again. A `Refusal`
is returned as data, `{ refused }`, which the screen draws as "Not done" with
its sentence, never as something gone wrong. A model's tools move and write
through the router too (`useToolSteps`).

**What the body says.** `body[data-state]` is written by one component,
`PageState` of `doing.ts`, from the router alone: `opening` until the first
screen is drawn, `busy` (every button off, the doing line saying what) from
the moment the router starts to read or run anything, and while a read says
it is still under way (a connection followed), `ready` in the commit that
draws what the router read, and `error`, with why in `data-error`, when a read
or a step went wrong. After a step, `ready` waits as well for the screen's
`aria-busy` parts, so that nothing a step brought is drawn after it; after a
plain move they fill in after it. `data-trace` keeps the last eight changes of
state, each with where and who asked: a test that fails prints it.

To add a screen:

1. Give it an address in `addresses.ts`. A path that starts with none of
   `pods/`, `tables/` and `encrypted-pods/` also goes in `SCREENS` there, or
   a link to it loads the page again instead of moving in place.
2. Write it in a file of `src/`: its loader in `screen(…)`, its `…Screen` and
   its `…Page`, as above.
3. Give it a route in `App.tsx`, `leaf(path, loader, Screen)`, which gives it
   the steps and the shell. A step of its own is one more entry of `steps`.
4. An operation of PodApi it needs that the screens do not call yet: its line
   in `PodApi` of `src/api.tsx`. A new operation is a function of
   `podApi(host)` in `pod-api.ts`, its input's schema in `server/inputs.ts` and
   its route in `server/api.ts`; the Node target's typed client then knows its
   input and output, and the browser target calls it in the page.

Styling is Tailwind 4, set up in `src/style.css` (the plugin is in
`vite.config.ts`). `@theme` there holds the colours, the one breakpoint (`md`,
46rem) and the shadows; the dark colours redefine the same tokens under
`prefers-color-scheme`, so `bg-panel` or `text-muted` follows the person's
setting with no `dark:` variant. Preflight is not imported: the screens rely on
the browser's own margins and lists, and `@layer base` holds the defaults every
screen shares (the body, links, `h1` and `h2`, buttons, inputs, tables). Put
utilities on the element; the strings several screens share are in
`src/look.ts`. Keep a semantic class (`card`, `tile`, `change`, `dialog`,
`chat-log`, a step's `now`) and every `data-*` beside the utilities: the tests
and the page's own links select by them, and an element's class names are its
address in the DOM contract. A box opens by the address's hash with `hidden
target:grid`. `.pending`'s shimmer is the one rule left in `@layer components`.

Without Preflight, what Tailwind's docs assume is not so here: every `<button>`
starts as the accent button of `@layer base`, so a utility-styled button keeps
a 1 px accent border unless it says `border-0` or another `border-*`; `ul` and
`ol` keep their bullets and padding; `p`, `h3` and `dl` keep the browser's
margins and sizes. A semantic class the tests
select by must not be a utility's name (`grid`, `table`, `hidden`, `block`):
`.filter` on the pod page's filter box already collides, harmlessly because
the utility's variables are empty, and stays because the tests select it.

The app, `npm run ask` and every add-on reach the pods through
`podApi(host)` in `pod-api.ts`, plain JSON in and out, each operation with one
input type, its route's schema (`Input` of `server/inputs.ts`), and one output
type (`Output` of `pod-api.ts`), which the server also
serves as `POST /api/<operation>`; `pod.ts` (`npm run pod:load`, and `npm run reset`
through `resetAll` in `pods.ts`) writes pods with `openPod` and `replayKit` directly,
and `console.ts` opens a raw `Pod` through `openWithoutWords`;
an encrypted pod is opened only by the app, with its six words (`src/newpod.tsx`,
at `/encrypted-pods/<name>`), and `npm run ask` refuses it, as its host is
`nodeHost({ opensEncrypted: false })` (`node-host.ts`), and `console.ts` refuses it too;
`tools.ts` holds the one list of tools a model reaches the app by (`TOOLS`), each
calling `podApi`'s operations only, with its consent `tier`: `free` reads
(`list_pods`, `changeTools` of `cascade-runtime` run by `podApi`'s `tool`, `worth_a_look`, `ask`) and moves the app
(`open_pod`, `open_trend`, `open_entry`, `open_classes`, `open_panel`, `open_table`, through the door's `open` and its own addresses), and `ask` writes,
which the person confirms first (`make_pod`, never encrypted; `check_tables`; `set_world_date`). `NEVER` is what
no tool calls: `makePod` with `encrypt`, `waitingWords`, `confirmWords`, `unlock`, `connect`, `bring`,
`deleteAll` and `resetAll`. WebMCP (`src/tools.ts`), on both
targets and every screen, offers every tool by its tier (the last section says how). A model reached
by any door sends what the tools return to its provider when it is hosted:
never point one at a person's own pod without their say. The starter holds only
made-up records (the kits, the demo hospitals); before connecting real records,
decide whether a hosted model may see them.
A pod's page also brings in a record from a hospital of the test directory
(`src/hospitals.tsx`). On Node the person signs in on the hospital's own page
in the same tab, and `hospitals.ts` receives the redirect on `/callback`,
which goes back to the pod's page with the connection in a box over it
(`?connection=<n>#connection`); in a browser the sign-in opens in a popup that
returns to `signed-in.html`. The demo hospitals, in `demo-hospital/`, are
pretend: on Node they answer on a loopback port of their own (`serveDemo`), in
a browser from the service worker the build carries.
The title bar's File menu runs `podApi`'s `deleteAll` and `resetAll`; both keep
the reference tables, and on Node `resetAll` then loads the kits through
`restoreKits` in `pods.ts`, as `npm run reset` does; Help, About says the app's
name and version and the `cascade-runtime` it runs on.
Under the pods, the sidebar lists the sources of the reference tables the pods
are matched with (`sourcesOf(held())`, from `tablesBeside`). `/tables/<id>/`
shows a source: its publisher, licence and freshness, a search over all its
tables (`search()`, `?q=&page=`, 50 codes a page) and the tables it publishes;
with `?code=<code>`, a code's page (`facts()`), which links to the code's own
page at its publisher where its code system has one. For a table's id it shows that
table alone, with which pods use which version (`uses()`). Check now runs
`podApi`'s `checkTables`.
A pod's page names each record by its code's name in those tables
(`about(codesOf(answers))`, gathered by `codesSaid`), else by the record's own
text, and tags a retired code. Above the tiles, "Worth a look" (`worthALook`
of `said.ts`, drawn in `pod.tsx`) lists what needs review, each report that differs from
ClinVar today and each pair of medications that share an ingredient, each line
linking to its entry; a line, a row and an entry carry the same tag (`TAGS`).
Below it, "What changed" (in `pod.tsx`, over the changes `podApi`'s `answers`
finds in the pod's medication history and lab results) has a card for each change after a
medication started or stopped, in `CHANGED`'s words, which state an order and a
comparison of means and never a cause; each card links to its results
(`#change-<key>`) and to the trend at `/pods/<name>/trend?test=<LOINC>&medication=<RxNorm>`
(`trend.tsx`, over `podApi`'s `trend`; `addresses.ts` makes the address, and
`trendPath` in `pods.ts` gives it to the scripts). A pod that has been imported twice or more adds, under the cards,
"Where this comes from" (`howOf`, over `pod/What each import brought in`, `record/Its revisions, in the order they arrived` and
`record/What each version says`): the imports in order, each with its source, its retrieved date and what it brought
in, and the medication's versions with what differs between them. Alex's, Priya's and Martin's pods
hold too little for a card; Tamsin's holds one, and so does a story patient's:
Ines Calloway, at Cascade North, by "+ New pod" and "Sign in at Cascade North". `TREND_VIEW` is the trend as a tool
a model can call, `open_trend` of `tools.ts`; a model reaches the trend by it, or through each
`find_changes` finding's `view` address.
A row of a tile's table opens its entry at
`/pods/<name>/entries/<id>`: what it is, where it came from (a line for each
document its records were derived from) and what else is known, which is what
Cascade did with it and what the tables say of its codes, each claim naming its
table and version. The page finds the entry by the last part of its IRI
(`entryId`); it never builds an IRI from an address. A genetic variant is a tile
and an entry like any other: its entry shows each of its reports, with the lab
it came from, beside what ClinVar says today (`variantClassification()`,
`pod.agreement()` and `labels()`, gathered by `variantsSaid`), read from the
app's current version of the series, with its credit; when that finds one
variation and a ClinVar names series holds its name, the entry is called by that
name, protein change included; it records nothing in the pod. A pod with active medications links to `/pods/<name>/classes`, its medicines
by class (`pod.medicationClasses()`, the classes named by `classesSaid`): the
classes the tables give each, one class alone at `?class=<class IRI>`, which
medicines are in none, and which have a class left out because the sources class
their ingredient's forms differently; a lab result coded in LOINC is named by LOINC's long common
name, and a code's page in the tables shows a panel's members and the classes of a
medication.
Stop the app's server
with Ctrl+C in its terminal, or by the process you started, never by killing
every Node process.

Before changing the app, read the full guide, the version matching the package
installed: `node_modules/cascade-runtime/guide/AGENTS.md`.

An app never:

- writes a pod's files, or reads them but through `ask`;
- parses Turtle: it asks a question instead;
- names a thing: it uses the guide's placeholders and the IRIs calls return;
- imports or claims what the person has not said is theirs.

## The starter

This app was made from a starter, a demonstration: rebuild it in any framework,
keeping the package and the pods, under `pods/<name>/`. It is made with four,
`alex-rivera`, `priya-natarajan`, `martin-okafor` and `tamsin-vale`.

- `npm run help` lists every command.
- `npm run reset` removes every pod and loads those four again.
- `npm start` builds the app (`index.html`, `src/`, by `vite.config.ts`) into
  `dist/` when it has none or a file it is built from is newer, and serves it
  from `server/main.ts` on `PORT` (3000 if unset), with PodApi at `/api/`;
  stop it with Ctrl+C or by its process, never
  by killing every Node process. A pod's page links to bringing in a record from
  a hospital of the test directory: the app's `hospitals.ts` signs in,
  receiving the redirect on `/callback`. An option to an npm script goes after
  `--`.
- `npm run dev` serves the same app from its sources through Vite, in the same
  process, the pages redrawn on every save.
- `npm run browser` builds the app to run in a browser alone into
  `dist-browser/` (`server/browser.ts`), PodApi in the page and the runtime
  beside it as files, with each kit's sample, which a first visit copies into
  the browser; it names them to the build in `CASCADE_SAMPLES`. It then serves
  the folder on `PORT` (3000 if unset), with no `/api/` and no chat. Making the
  samples takes about a minute, and a port already in use stops it only once
  they are made: stop what holds the port, or set `PORT` to another.
- `npm run build` builds the app into `dist/` for `server/main.ts`, as
  `npm start` does when it needs to.
- `npm run typecheck` checks the TypeScript of the app's pages
  (`tsconfig.json`) and of its server, its commands and its build
  (`tsconfig.node.json`).
- `npm test` runs the app's own tests (`test/`, on Vitest) in seconds; see
  "The app's tests" below.
- `npm run test:e2e` runs the one browser test (`e2e/`, on Playwright), which
  needs Chromium: `npx playwright install chromium` once.
- `npm start` with `CASCADE_WORLD_DATE` set (`YYYY-MM-DD`, or an instant with
  its timezone) makes the demo hospitals answer with their records as they
  stood at the end of that day, and say so on their sign-in page; without it
  they answer with everything they hold. The variable is read once, when the
  app starts. While it runs, a pod's page and the page that finds a hospital say
  what the hospitals answer as of, and offer "Change the world's date"
  (`WorldDate` in `src/hospitals.tsx`), which moves the date, or takes it back
  to everything with Today; `/world-date?back=<path>` opens that form on the
  app's page at `path`. The next sign-in
  and bring-in answer as of it, and a connection's box says what its pull
  answered as of.
- `npm start` serves the demo hospitals on a loopback port of their own, which
  the console line `The demo hospitals are listening at http://127.0.0.1:<port>/`
  names, and the app reaches them over it, through the sandbox's
  `demoRemapFetch`; a hospital's sign-in page is at
  `http://127.0.0.1:<port>/<hospital>/authorize`.
  The records are the same, still named under `https://<hospital>.demo.invalid`.
  Another tool reaches a hospital only by sending a `Forwarded: host=<hospital>.demo.invalid`
  header; called directly, the port answers the sign-in page and a 404.
- `npm run pod:load -- <kit> [--through <step>] [--as <name>]` replays a kit's
  story into `pods/<name>/`: `alex-rivera` is Alex Rivera's, from Apple Health
  exports, `priya-natarajan` Priya Natarajan's, from exports and C-CDA files
  together, `martin-okafor` Martin Okafor's, two FHIR reports of one
  variant beside what ClinVar says today, and `tamsin-vale` Tamsin Vale's, two
  pulls from Cascade North a year apart with her metformin stopped between
  them, on the app's tables like any pod it creates. `--through J1`
  stops Alex's after her first export, leaving the rest to `import`.
- `npm run pod:new <name>` makes an empty pod.
- `npm run pod:reset <name>` removes a pod.
- `npm run ask -- [--pod <name>] "<question>"` prints a question's rows.
- `npm run console -- [--pod <name>]` opens a REPL with the pod as `pod`.
- `npm run kit:export -- <kit> <download>` copies a download into the app, for
  `look`: `alex-rivera x-e12` as `apple_health_export`, and
  `priya-natarajan kestrel-harbor-health-summary.xml` as that file.
- `npm run patient:add -- <hospital id> <file>` checks a patient's file and
  writes it to `people/<patient id>/sources/<hospital id>/fhir.json`, with
  the person's `person.json` (name, birth date and gender, from the Patient)
  when they have none. The app's own hospitals are folders of `hospitals/`,
  each named for its `fhirBase` host's first label and holding only its
  `hospital.json` (the package's `cascade-north` is the model; its `fhirBase`
  must be on a `.demo.invalid` host); its people are folders of `people/`. The
  app loads both at start with the package's, and refuses a source whose
  Patient disagrees with its `person.json`. The file is a FHIR Bundle:
  a `collection`, written as it is and present at every date; a `history`, one
  entry per version with its `response.lastModified`; or a `collection` whose
  entries carry `"shorthand": { "active": "2022-03-01", "stopped": "2024-04-15" }`
  beside `resource`, which the command compiles to a `history`. A
  `MedicationStatement` or a `Condition` with `stopped` becomes two versions,
  and an entry without `shorthand` is placed at its own clinical date. It
  refuses a stop it cannot date, and a patient already there.

## The app's tests

Run `npm test` after a change; it takes a few seconds. The tests are examples to copy: each shows one behaviour, on the
smallest input that shows it, and asserts what it means, never bytes or a whole file.

- `test/api.test.ts` puts PodApi behind the server in the process: `appServer(...)` from `server/app.ts` over a pod
  replayed from a kit into a temporary folder, called with `app.request()`, so no port is opened. Copy it to test a new
  operation or route: the pods are listed, a pod's answers come back, an input the rules refuse is a 400 `{ refused }`.
- `test/tools.test.ts` holds the tool list to its rules: every tool in `tools.ts` is `free` or `ask`, and none calls an
  operation of `NEVER`. A tool you add needs a row in `RUNS`, or the test fails.
- `e2e/pod.test.ts` is the one browser test, on Playwright: it starts the app with `npm start`, opens Alex Rivera's pod
  and waits for the page to say it is ready (`body[data-state="ready"]`, never `main`'s text), then looks for its
  tiles (`.tiles .tile`). A failure prints `body[data-trace]`, the page's last changes of state. Chromium is not
  downloaded by `npm install`; `npx playwright install chromium` once, then `npm run test:e2e`.

To add a test, write a `*.test.ts` in `test/` (`import { expect, test } from "vitest"`); Vitest runs everything there
(`vitest.config.ts`). Import the app's files by their `.ts` names.

## WebMCP, the doors and the tiers

On both targets the page offers a browser agent the same tools on every screen, through the browser's
`document.modelContext` where it has one (`useTools` in `src/tools.ts`, mounted once in `App.tsx`; with none, the page
offers nothing). The tools are the whole of `TOOLS`, every tool by its tier:

- **free** tools run at once: the reads, and the `open_*` tools, which move the app in place through the router, as a
  click does, and answer once the screen they open is drawn.
- **ask** tools (`make_pod`, `check_tables`, `set_world_date`) show the page's own box (`useConfirm` in
  `src/confirm.tsx`), one at a time, which the chat's writes use too when it is added. Allow runs the write as the
  route's action, which reads the screen again; Cancel, or leaving the pod, answers `{ refused: "The person said no" }`
  and writes nothing.
- the **never** list (`NEVER` in `tools.ts`) is no tool in any door.

With a pod shown, a tool of one pod takes it as given; on a screen with none (the tables, a locked pod) it takes the
pod's name as `pod`. `open_pod` always takes the name. The tools are offered again only when the pod shown changes, and
taken away in the commit that draws the next one.

The list is one, whatever door offers it: WebMCP (`src/tools.ts`) offers every tool, and each add-on that is a door
(the chat, the MCP server) says below which it offers. The Node bundle
carries no runtime, so its page gets the reads from the server: `GET /tools` lists them and `POST /tools/<name>` runs
one (`server/tools.ts`), while the browser target runs them in the page (`reads` of `src/hosts/browser.ts`).

To add a tool:

- one the page runs itself (it moves the app, or writes after the person's Allow): one entry in `PAGE_TOOLS` in
  `said.ts`, with `run(api, input, door)` calling only PodApi's operations and moving through `door.open`. A write
  also needs an entry in `ACTIONS` in `src/confirm.tsx`. Every door then offers it.
- one the server runs (a read): one entry in `TOOLS` in `tools.ts`, with `tier: "free"`. Both targets' WebMCP offer
  it, the Node page through `/tools`, and so does every door an add-on adds.

Either way, add its row to the `RUNS` table in `test/tools.test.ts`, which fails for a tool with none.
