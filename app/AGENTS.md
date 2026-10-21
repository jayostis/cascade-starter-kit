# For an agent building on this app

This app was made from the Cascade starter. It is a demonstration, not a
foundation: rebuild it in any framework. What carries over is
`cascade-runtime`, which keeps the pods, and the pods under `pods/<name>/`. It
starts with four, Alex Rivera's, Priya Natarajan's, Martin Okafor's (two
FHIR reports of one variant, beside what ClinVar says today) and Tamsin Vale's
(two pulls from Cascade North a year apart), loaded from the
kits the package carries; `npm run reset` puts them back as they were made, and
`npm run help` lists every command. `npm start` serves the app, and
`npm run dev` restarts it on every save.
`npm run kit:export -- alex-rivera x-e12` copies one of Alex's downloads into
the app as `apple_health_export`, and
`npm run kit:export -- priya-natarajan kestrel-harbor-health-summary.xml` one
of Priya's C-CDA files under its own name. What the pages show is in
`summary.mjs`: Preact components written with `htm`, no JSX and no build
step, plain functions from a pod's question rows to the page's elements,
which a browser can render too. Change one by editing its `` html`…` ``
template; it imports only `preact`, `preact/hooks` and `htm`. Rewrite it as
you like.
`npm run mcp` runs `mcp.mjs`, an MCP server on stdio over the pods, for
Claude Desktop, VS Code or any MCP client (the README says how to add it);
the app, the chat, the MCP server and `npm run ask` reach the pods through
`podApi(host)` in `pod-api.mjs`, plain JSON in and out, which the server also
serves as `POST /api/<operation>`; `pod.mjs` (`npm run pod:load`, and `npm run reset`
through `resetAll` in `pods.mjs`) writes pods with `openPod` and `replayKit` directly,
and `console.mjs` opens a raw `Pod` through `openWithoutWords`;
an encrypted pod is opened only by the app, with its six words (`server.mjs`: `/encrypted-pods`,
`/pods/<name>/open`), and `mcp.mjs` and `npm run ask` refuse it, as their host is
`nodeHost({ opensEncrypted: false })` (`node-host.mjs`), and `console.mjs` refuses it too;
`tools.mjs` holds the one list of tools a model reaches the app by (`TOOLS`), each
calling `podApi`'s operations only, with its consent `tier`: `free` reads
(`list_pods`, `changeTools` of `cascade-runtime` run by `podApi`'s `tool`, `worth_a_look`, `ask`) and moves the app
(`open_pod`, `open_trend`, `open_entry`, through the door's `open` and its own addresses), and `ask` writes,
which the person confirms first (`make_pod`, never encrypted; `check_tables`; `set_world_date`). `NEVER` is what
no tool calls: `makePod` with `encrypt`, `waitingWords`, `confirmWords`, `unlock`, `connect`, `bring`,
`deleteAll` and `resetAll`. The MCP server offers the free reads; `chat.mjs`, `npm start`'s
`POST /chat`, the free tools, so its chat only reads and moves the app; try/'s WebMCP the free tools for the
pod shown. `server/chat.ts`, `npm run next`'s `/chat`, runs on the Vercel AI SDK (`ai`): `chatTools(api)` offers
every tool of the list, the free reads with a server `execute` and the navigation and `ask` tools with none, so a
call to one ends the server's turn and the page runs it (the window is step 9's). `POST /chat` takes the SDK's
`messages` beside `pod`, `page` and `context`, answers with the SDK's UI message stream, stops after `MAX_ROUNDS`
rounds of tool calls, and says the model's refusal as a `data-refused` part; `GET /chat` gives the model's
`{ provider, name, local }`, or `{}`. A hosted client sends what the tools return to its provider:
never point one at a person's own pod without their say. The starter holds only
made-up records (the kits, the demo hospitals); before connecting real records,
decide whether a hosted model may see them.
`npm run model` runs `model.ts`: it asks which model a chat uses, checks on the
AI SDK that the model calls a tool and writes `CASCADE_MODEL_PROVIDER`, `_URL`, `_NAME` and `_KEY`
to `.env` (untracked; `--off` removes them). `models.ts` is the door to a model
for the new server: `modelFrom()` reads those settings, loads `.env` itself and gives
nothing when there are none, and `modelOf()` makes the model through the AI SDK's
provider packages: `@ai-sdk/anthropic`, `@ai-sdk/groq`, `@openrouter/ai-sdk-provider`, and
`@ai-sdk/openai-compatible` for Gemini (at its OpenAI-compatible address), a model on this computer and any
other address. `model-client.mjs` is `npm start`'s door, on wires of its own, over the same settings and
`PROVIDERS`. Nothing else may hold a model's key.
`server.mjs` answers requests, hands it the rows, and renders each page to
HTML with `preact-render-to-string`. A pod's page also brings in a
record from a hospital of the test directory: the person signs in on the
hospital's own page, and `hospitals.mjs` receives the redirect on `/callback`,
which goes back to the pod's page with the connection in a box over it
(`?connection=<n>#connection`); the demo hospitals, in `demo-hospital/`, are pretend and answer on a loopback port of their own (`serveDemo`).
The title bar's File menu posts to `/delete-all` and `/reset-all`, which call
`podApi`'s `deleteAll` and `resetAll`; both keep the reference tables, and `resetAll`
then loads the kits through `restoreKits` in `pods.mjs`, as `npm run reset` does; Help,
About says the app's name and version and the `cascade-runtime` it runs on.
Under the pods, the sidebar lists the sources of the reference tables the pods
are matched with (`sourcesOf(held())`, from `tablesBeside`). `/tables/<id>/`
shows a source: its publisher, licence and freshness, a search over all its
tables (`search()`, `?q=&page=`, 50 codes a page) and the tables it publishes;
with `?code=<code>`, a code's page (`facts()`), which links to the code's own
page at its publisher where its code system has one. For a table's id it shows that
table alone, with which pods use which version (`uses()`). Check now posts to
`/tables/check`.
A pod's page names each record by its code's name in those tables
(`about(codesOf(answers))`, gathered by `codesSaid`), else by the record's own
text, and tags a retired code. Above the tiles, "Worth a look" (`worthALook`,
drawn by `worthPart`) lists what needs review, each report that differs from
ClinVar today and each pair of medications that share an ingredient, each line
linking to its entry; a line, a row and an entry carry the same tag (`TAGS`).
Below it, "What changed" (`changedPart`, over `changesIn` of the pod's
medication history and lab results) has a card for each change after a
medication started or stopped, in `CHANGED`'s words, which state an order and a
comparison of means and never a cause; each card links to its results
(`#change-<key>`) and to the trend at `/pods/<name>/trend?test=<LOINC>&medication=<RxNorm>`
(`trendPage` over `labSeriesIn` and `timelineIn`; `trendPath` in `pods.mjs`
makes the address, a view never builds one). A pod that has been imported twice or more adds, under the cards,
"Where this comes from" (`howOf`, over `pod/What each import brought in`, `record/Its revisions, in the order they arrived` and
`record/What each version says`): the imports in order, each with its source, its retrieved date and what it brought
in, and the medication's versions with what differs between them. Alex's, Priya's and Martin's pods
hold too little for a card; Tamsin's holds one, and so does a story patient's:
Ines Calloway, at Cascade North, by "+ New pod" and "Sign in at Cascade North". `TREND_VIEW` is the trend as a tool
a model can call, `open_trend` of `tools.mjs`; a model reaches the trend by it, or through each
`find_changes` finding's `view` address.
Every page has the chat strip (`Chat` renders it, from the `chat` that `frame`
is given: the model's `{ provider, name, local }`, never its address or key, the
pod's name, and `suggestions`, a list of texts; `chatStrip` runs it, both in
`summary.mjs`, with `CHAT_STYLE`). It talks to `POST /chat` (`chat.mjs`). The
browser keeps the chats, in `localStorage`, each under the pod it is about, and
the open chat's ID in `sessionStorage` (`cascade.chat.open`); a tool's `open`
address moves the app there when the turn ends, and the chat goes with it. Any
element with `data-ask` (a JSON context) starts a new chat with that context,
and one with `data-ask-text` sends its text as typed. A `data-ask` click also sends
the kind's first question (`firstQuestion`), stopping a turn still running first.
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
- `npm run dev` serves the app as `npm start` does, restarting it on every save.
- `npm run next` builds the app being ported to React (`index.html`, `src/`, by
  `vite.config.ts`) into `dist/` and serves it with PodApi at `/api/` from
  `server/main.ts`, on `PORT` (3001 if unset), with the chat's `/chat` on the AI SDK.
  Screens not ported yet say so.
- `npm run dev:next` serves that app through Vite instead, in the same
  process, rebuilt on every save.
- `npm run build` builds that app for `server/main.ts`.
- `npm run build:browser` builds it for a browser, PodApi in the page and the
  runtime beside it as files.
- `npm run typecheck` checks the TypeScript of the app (`tsconfig.json`) and of
  its server and build (`tsconfig.node.json`).
- `npm start` serves the app; stop it with Ctrl+C or by its process, never by
  killing every Node process. A pod's page links to bringing in a record from a
  hospital of the test directory: the app's `hospitals.mjs` signs in, receiving
  the redirect on `/callback`. An option to an npm script goes after `--`.
- `npm start` with `CASCADE_WORLD_DATE` set (`YYYY-MM-DD`, or an instant with
  its timezone) makes the demo hospitals answer with their records as they
  stood at the end of that day, and say so on their sign-in page; without it
  they answer with everything they hold. The variable is read once, when the
  app starts. While it runs, a pod's page and the page that finds a hospital say
  what the hospitals answer as of, and link to `/world-date`, where a person
  moves the date, or takes it back to everything with Today; the next sign-in
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
- `npm run mcp` is an MCP server on stdio over every pod, for a client such as
  Claude Desktop to start (the starter's README says how). A hosted client
  sends what the tools return to its provider.
- `npm run model [-- --off]` asks which model the app's chat uses (a free
  hosted key, a model on this computer, or a paid one), checks that it calls a
  tool and keeps the choice, key included, in the app's untracked `.env`.
  `--off` removes it. Without `.env` the app runs as it did.
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
