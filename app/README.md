# cascade-app

An app on a Cascade pod: a React app that shows what a pod holds, served on
Node over the pods in `pods/` or built to run in a browser alone, and commands
to load, make, remove and ask pods. It depends only on
`cascade-runtime`, which keeps the pods; this app never writes a pod's files
itself.

It is written in TypeScript, on [React](https://react.dev) with
[React Router](https://reactrouter.com), built by [Vite](https://vite.dev);
its server is [Hono](https://hono.dev). Node 22.18 or later runs its `.ts`
files as they are. It is the starter's base: `create-cascade-app --with chat`
adds a chat with a model, and `--with mcp` an MCP server, each with its section
at the end of this file.

The app is made with four pods, `alex-rivera`, `priya-natarajan`,
`martin-okafor` and `tamsin-vale`, loaded from the kits the package carries.
Alex Rivera, Priya Natarajan, Martin Okafor and Tamsin Vale are made up. Alex's
records come from Apple Health exports; Priya's from exports and C-CDA files
together; Martin's pod holds two FHIR reports of one variant beside what
ClinVar says today; Tamsin's two pulls from one hospital a year apart, her
metformin stopped between them. `npm run reset`
puts the app back as it was made.

## Start

```sh
npm start
```

then open <http://127.0.0.1:3000/>. The first start builds the app's pages into
`dist/`, and a start after you change one of its files builds them again. Or
run the same app in your browser alone, with no server behind it:

```sh
npm run browser
```

which builds it into `dist-browser/` with a sample of each kit's pod, in about
a minute, and serves those files at the same address. A first visit copies the
samples into the browser, which then keeps its pods itself; the pods in `pods/`
are not used, and there is no chat.

The pods are on the left, named as their
people. A pod's page reads as that person's health record: how many records,
from which places; what is worth a look, such as two hospitals disagreeing on
how severe an allergy is, or a genetic report that differs from ClinVar today,
each linking to its entry; and a tile for
each kind of record, which opens a table you can sort by a heading and filter.
"+ New pod" makes a pod for anyone by name, or for one of the demo hospitals'
made-up patients in one click. Tick "Encrypt this pod with six words" there and the app
shows six words, asks for the second and the fifth, and only then makes the pod with
every file sealed; after a restart the pod's page asks for the words. The words
are the only way in and cannot be recovered. `npm run ask` and `npm run console`
do not open an encrypted pod: they say so in one line.

Under what is worth a look, a pod with medication history and lab results has
"What changed": for each test whose results differ before and after a
medication started or stopped, a card with the two means, a small chart, the
results behind it and "Open the trend", a chart of that test over time with the
medication's start and stop dashed across it, at
`/pods/<name>/trend?test=<LOINC>&medication=<RxNorm>`. It states what changed
after what, never why. A pod brought in more than once also says where that
comes from: the imports in order, with their source and retrieved date, and the
medication's earlier and later version. Alex's, Priya's and Martin's pods hold too little to show a card.
Ines Calloway, a made-up patient at Cascade North, does: her LDL is lower after
atorvastatin started. "+ New pod", Ines Calloway, "Sign in at Cascade North" and
"Bring it into … pod" make that pod.

The title bar has two menus. File has "Delete all data", which removes every
pod, and "Reset all data", which does what `npm run reset` does; each first
asks you to confirm. Help has "About": this app's name and version, the
`cascade-runtime` it runs on, and where its code is.

The server answers on `127.0.0.1` only, at the port in `PORT`, or 3000. It sees
a pod loaded while it runs; after `pod:reset` of a pod it has shown, restart it.
Stop it with Ctrl+C in its terminal.

## Bring in a record from a hospital

A demo patient's pod has a Sign in button for each hospital holding them; any
pod has "Find a hospital", which searches the test directory by name or place
and lists each demo hospital's sample patients. Press Sign in:

1. Your browser goes to the hospital's own sign-in page. A demo hospital's
   asks whom to sign in as and offers Allow and Cancel.
2. The hospital sends you back to this app, at `/callback`, which opens a box
   over the pod's page. With `npm run browser` the hospital's page opens in a
   window of its own instead.
3. The box shows the connection's steps while the record is fetched, then what
   the hospital has, and whether the pod already has records from there.
4. "Bring it into … pod" imports it as the pod's person's; when the record names
   another person, the box says so and the button names both people ("Bring
   Odalys Brandt's records into Rowan Ellery Marsh's pod anyway"). The box says each
   part of the import as it goes, then closes, and the pod's page says what was
   brought in.

Cascade North and Cascade South are pretend hospitals, in `demo-hospital/`,
with made-up patients. They need no account and no network: `npm start` serves
them on a loopback port of their own (the console says which), the app reaches
them over it, and their sign-in pages are at that port. The SMART Health IT
Sandbox is a real test server and needs the network.

To add a hospital of your own, make a folder under `hospitals/`, named for its
`fhirBase` host's first label, with a `hospital.json` like Cascade North's (its
`fhirBase` on a `.demo.invalid` host). Add a patient to it, or to Cascade
North or South, with `npm run patient:add -- <hospital id> <file>`, which
writes them under `people/`. The guide says what the file may hold, a stop's
dates in short included.

## The tools a model reaches

`tools.ts` is the one list of tools a model reaches the app by, the browser
target's WebMCP, and the chat and an MCP client when they are added, alike.
Each calls the app's PodApi only, and each has a consent tier:

- **free**, reads: `list_pods`, `find_changes`, `finding_rows`, `lab_series`,
  `timeline`, `worth_a_look` and `ask`; and moving the app: `open_pod`,
  `open_trend`, `open_entry`, `open_classes`, `open_panel` and `open_table`.
- **ask**, writes the person confirms first: `make_pod` (never encrypted),
  `check_tables` and `set_world_date`.
- **never**, what no tool calls: making an encrypted pod, its six words and
  password (`waitingWords`, `confirmWords`, `unlock`), the sign-in at a hospital
  (`connect`), bringing a record in (`bring`: the person does it from its box),
  and Delete all and Reset all.

WebMCP, where the browser has `document.modelContext`, offers every tool on
every screen of both targets, an `ask` write only after the page's own Allow.

## The commands

`npm run help` lists every command with what it does. An option to an npm
script goes after `--`, or npm keeps it for itself.

- `npm run dev` serves the app as `npm start` does, from its sources through
  Vite, the pages redrawn whenever a file is saved.
- `npm run build` builds the pages into `dist/`, as `npm start` does when they
  are older than their sources.
- `npm run reset` removes every pod and loads Alex's, Priya's, Martin's and Tamsin's again, as
  the File menu's "Reset all data" does: both load the kits through
  `restoreKits` in `pods.ts`.
- `npm run pod:new <name>` makes an empty pod.
- `npm run pod:load -- <kit> [--through <step>] [--as <name>]` replays a kit's
  story into `pods/<name>/`. One app can hold a kit at two points:
  `npm run pod:load -- alex-rivera --through J24 --as alex-rivera-j24` beside
  `alex-rivera`.
- `npm run kit:export -- <kit> <download>` copies a kit's download into this
  folder as a person puts it there: `alex-rivera x-e12` as
  `apple_health_export`, `priya-natarajan kestrel-harbor-health-summary.xml` as
  that file.
- `ask` and `console` need `--pod <name>` whenever the app has more than one
  pod, as a made app does; it may be left out only when there is exactly one.
- `npm run typecheck` checks the TypeScript of every file of the app.
- `npm test` runs the app's own tests (`test/`, on [Vitest](https://vitest.dev)): PodApi behind the server, in the
  process, and the tool list's tiers. They take seconds, and they are short so you can copy one for your own change.
- `npm run test:e2e` runs one browser test (`e2e/`, on [Playwright](https://playwright.dev)): it starts the app, opens
  Alex Rivera's pod and checks its first tiles draw. Install the browser it uses once, with
  `npx playwright install chromium`; `npm install` does not download it.

## The files

Every file of the app is TypeScript: `.tsx` for the pages, `.ts` for the rest,
which Node runs as it is.

- `index.html`, `src/`: the app, in React, routed by React Router and built by
  Vite (`vite.config.ts`, with `vite/cascade.ts`, which adds what each target
  carries beside its bundle). `src/App.tsx` holds the routes, and each screen
  has its file: `pod.tsx`, `entry.tsx`, `trend.tsx`, `classes.tsx`,
  `panel.tsx`, `tables.tsx`, `hospitals.tsx`, `newpod.tsx`; `AGENTS.md` says
  how to add one. The look is Tailwind 4: utilities on the elements, the
  colours and their dark values in `src/style.css`. A screen reads the pods through
  PodApi, `usePodApi()` of `src/api.tsx`, from the host the build chose: on
  Node `src/hosts/http.ts`, which calls the server's `/api/` through Hono's
  typed client, and in a browser `src/hosts/browser.ts`, which runs
  `pod-api.ts` in the page. Under the pods, the sidebar lists
  the reference tables the pods are matched with; `/tables/<id>/` shows one
  with a search, and Check now reads their feeds again.
- `said.ts`: what the pages say, as plain functions with no imports, from a
  pod's answers to sentences, rows and tags; `addresses.ts`, every address of
  the app.
- `server/`: `npm start`'s server, on [Hono](https://hono.dev): `main.ts`
  starts it, `app.ts` answers, `api.ts` serves every operation of
  `pod-api.ts` as `POST /api/<operation>`, JSON in and out, with each input
  checked by `inputs.ts`, `tools.ts` runs the tool list's reads for the
  page, and `guard.ts` refuses another site's requests. `browser.ts` is
  `npm run browser`, and `samples.ts` what its samples carry for a first
  visit.
- `pod-api.ts`: `podApi(host)`, every read and write the app makes of its
  pods and its reference tables, plain JSON in and out, refusing bad input
  with a `Refusal`; each operation's input is its route's schema and its
  output what it gives (`PodApi`, `Output`). The server, `npm run ask` and
  every add-on call it, and the browser target loads the same
  file: it imports only `cascade-runtime` and `said.ts`.
- `node-host.ts`: the host `podApi` reads on Node: the pods are folders in
  `pods/`, with the reference tables beside them; `opensEncrypted: false`
  refuses an encrypted pod, as `npm run ask` does. Also the
  hospitals and the world's date the server gives it.
- `hospitals.ts`: the sign-in at a hospital, which waits for the redirect
  back to `/callback`, and the world's date the demo hospitals answer as of.
- `demo-hospital/`: the pretend hospitals, a package of this app's own.
- `pods.ts`: what the commands and the server share: where pods live and what
  they are called, which one a command works on, deleting them and loading the
  kits again, and the addresses of a pod's page and its trend.
- `pod.ts`, `kit.ts`, `ask.ts`, `console.ts`, `patient.ts`: the commands, and
  `help.ts`, which lists them with what `help.json` says of each.
- `tools.ts`: the one list of tools a model reaches, with their tiers and
  what no tool calls, which every door shares. Each calls the operations of
  `pod-api.ts`.
- `AGENTS.md`: for a coding agent building on this app. The full guide to
  `cascade-runtime` is in `node_modules/cascade-runtime/guide/AGENTS.md`.
