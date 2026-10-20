// A pod as a person reads it: who it is for, where its records came from, what is worth a look, and a tile for each
// kind of record. Preact components written with `htm`: functions from a pod's question rows to the page's elements,
// which `server.mjs` renders to HTML and a page in a browser can render too, keeping a table's sort and filter in its
// state. It imports only `preact`, `preact/hooks` and `htm`, with no build step. Rewrite it freely: it is only this
// app's view.
import { Fragment, h } from "preact";
import { useEffect, useLayoutEffect, useState } from "preact/hooks";
import htm from "htm";
import {
  BRINGING,
  byFamily,
  capitalised,
  changeNames,
  compare,
  counted,
  DAY_MS,
  day,
  dayAt,
  dayInWords,
  entryId,
  ENCRYPT_BOX,
  failureSaid,
  familyFirst,
  firstQuestion,
  freshness,
  gradePerson,
  heldAt,
  HISTORY,
  hospitalName,
  howOf,
  importPart,
  LAB_SECTION,
  LABS,
  LARGE,
  leftSaid,
  LICENCES,
  listed,
  localDay,
  monthAt,
  named,
  namingCredits,
  near,
  notationOf,
  opening,
  personName,
  placeOf,
  plotOf,
  pullSaid,
  pulledAsOfSaid,
  RELATIONS,
  relationName,
  REPORTS,
  REQUIRED,
  resultsSaid,
  rounded,
  rowSaid,
  SECTIONS,
  sectionRows,
  sentenceOf,
  slug,
  SMALL,
  SOURCES,
  spread,
  statusOf,
  TAGS,
  testsIn,
  therapiesOf,
  timeOf,
  TREND_VIEW,
  trendOfFinding,
  trendTitle,
  typedName,
  UNOPENED,
  unitOf,
  valuesSaid,
  versionName,
  worldDateSaid,
  worthALook,
} from "./said.ts";

export {
  ago,
  byFamily,
  CHANGED,
  changeSaid,
  checkedNote,
  classedElsewhere,
  classesSaid,
  codesOf,
  codesSaid,
  compare,
  counted,
  day,
  dayInWords,
  demoPeople,
  didNote,
  ENCRYPT_BOX,
  ENCRYPT_FIELD,
  entryId,
  entryOf,
  failureSaid,
  familyFirst,
  firstQuestion,
  freshness,
  gradePerson,
  HISTORY,
  hospitalName,
  howOf,
  importPart,
  joinedBy,
  LABS,
  listed,
  localDay,
  MECHANISM,
  MEDICATIONS,
  named,
  NOT_WORDS,
  opening,
  pageNumber,
  panelSaid,
  panelsOf,
  patientName,
  patientNames,
  personName,
  placeName,
  placeOf,
  POD_CHANGED,
  pulledAsOfSaid,
  QUESTIONS,
  rounded,
  rowSaid,
  savedLoginChanged,
  sectionRows,
  SECTIONS,
  seenAt,
  slug,
  SOURCES,
  sourcesOf,
  suggestedQuestions,
  tableId,
  testsIn,
  TREND_VIEW,
  trendInput,
  trendTitle,
  typedName,
  UNOPENED,
  utcInstant,
  variantReports,
  variantSaid,
  variantsAsked,
  variantsSaid,
  withMechanism,
  WORDS_CHANGED,
  worldDateSaid,
  worldInstant,
  worthALook,
} from "./said.ts";

/**
 * Markup as Preact's elements: `${…}` in the template is a value, escaped when rendered, or more elements. A run of
 * spaces with a line break between two tags is dropped, so a space that matters stays on its line.
 */
export const html = htm.bind(h);

/** A tag as it is drawn, after a line, a row's name or an entry's heading. */
const tagged = (tag) =>
  html` <span class="tag${TAGS.find((each) => each.tag === tag)?.warm ? " warm" : ""}">${tag}</span>`;

/**
 * The part of a pod's page that lists `lines`, as `worthALook` gives them: each line's sentence a link to
 * `entryHref(line.entry)`, or plain text with no `entryHref`, then its tag. Absent with no line. With `ask`, each line has
 * an "Ask about this" button naming its entry (`{ kind: "worth", entry }`), which `worth_a_look` reaches. While `waiting`
 * for a line that is still to come, the part holds the space of one.
 */
export function worthPart(lines, entryHref, ask, waiting = false) {
  if (lines.length === 0 && !waiting) return undefined;
  return html`<div class="card worth"><h2>Worth a look</h2><ul>${lines.map(
    ({ sentence, entry, tag }) =>
      html`<li class="arrive">${entryHref === undefined ? sentence : html`<a href=${entryHref(entry)}>${sentence}</a>`}${tag !== undefined && tagged(tag)}${ask && askButton({ kind: "worth", entry: entryId(entry) }, sentence)}</li>`,
  )}</ul>${waiting && pending({ lines: 2, pitch: "1.8rem", said: "Checking ClinVar…" })}</div>`;
}

/**
 * A button that starts a chat about `context`: `{ kind: "finding", key }`, `{ kind: "entry", id }`, `{ kind: "worth", entry }` or `{ kind: "trend",
 * test, medication? }`, which `chatStrip` listens for. It names the thing, never its text, so the model reaches it through
 * its tools. `label` says which one to a screen reader.
 */
function askButton(context, label) {
  return html` <button type="button" class="quiet ask" data-ask=${JSON.stringify(context)} data-ask-label=${label} title="Ask about this" aria-label=${`Ask about this: ${label}`}><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 20.5l1.5-4.9A8 8 0 1 1 21 12z" /></svg></button>`;
}

/** A dialog's first link, to `href`: it covers the page behind the box, so a click outside the box closes it. */
const backdrop = (href) =>
  html`<a class="backdrop" href=${href} aria-label="Close the box" tabindex="-1"></a>`;

/**
 * A box over the page, shown when the page's address ends `#<id>`, with `body` under `heading`; its close link and
 * backdrop go to `back`, and a `wide` one is for a table.
 */
function box(id, heading, body, { back = "#", wide = false } = {}) {
  return html`<div class="dialog" id=${id} key=${id} role="dialog" aria-labelledby="${id}-title">
${backdrop(back)}
<div class="box${wide ? " wide" : ""}">
<a class="close" href=${back} aria-label="Close">×</a>
<h2 id="${id}-title">${heading}</h2>
${body}
</div>
</div>`;
}

/**
 * A section's filter box and table of `rows`, given in `opening` order, a heading button per column, each cell holding
 * what it sorts by in `data-key`.
 * Its state is the column it is sorted by and which way, and the filter's text: a heading sorts by its column, one way
 * then the other, and the filter hides the rows without its text. Rendered to a string, it is the table as it opens,
 * and the page's script sorts and filters it.
 */
function Table({ section, rows, entryHref }) {
  const [sort, setSort] = useState();
  const [wanted, setWanted] = useState("");
  const { at, up } = sort ?? {
    at: section.sortBy,
    up: !section.newestFirst,
  };
  const shown = (column, row) => column.show(row) ?? "";
  const key = (row) => String(section.columns[at].key(row) ?? "");
  const sorted =
    at === section.sortBy && up === !section.newestFirst
      ? rows
      : [...rows].sort(
          (a, b) =>
            (up ? 1 : -1) * compare(section.columns[at].type, key(a), key(b)),
        );
  const head = section.columns.map((column, index) => {
    const by = index === at ? (up ? "ascending" : "descending") : undefined;
    const click = () => setSort({ at: index, up: by !== "ascending" });
    return html`<th aria-sort=${by}><button type="button" data-type=${column.type} onClick=${click}>${column.head}</button></th>`;
  });
  const cell = (column, row, index) => {
    const text = shown(column, row);
    const cell =
      column.tag && text !== ""
        ? html`<span class="tag${column.warm(row) ? " warm" : ""}">${text}</span>`
        : text;
    return html`<td data-key=${column.key(row) ?? ""}>${
      index === 0 && entryHref !== undefined
        ? html`<a href=${entryHref(row.entry)}>${cell}</a>`
        : cell
    }${index === 0 && (row.tags ?? []).map(tagged)}</td>`;
  };
  const body = sorted.map((row) => {
    const hidden = ![
      ...section.columns.map((column) => shown(column, row)),
      ...(row.tags ?? []),
    ]
      .join("")
      .toLowerCase()
      .includes(wanted);
    return html`<tr hidden=${hidden || undefined}>${section.columns.map((column, index) => cell(column, row, index))}</tr>`;
  });
  const filter = (event) =>
    setWanted(event.currentTarget.value.trim().toLowerCase());
  return html`<input type="search" class="filter" placeholder="Filter" aria-label="Filter ${section.title.toLowerCase()}" onInput=${filter} />
<div class="scroll"><table>
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table></div>`;
}

/**
 * The section's tile, a link that opens its dialog, and the dialog: its `Table`, whose rows each link to
 * `entryHref(row.entry)` when given. A section that says which rows are current counts and names those, then how many
 * stopped.
 */
export function tile(section, rows, entryHref, by) {
  const id = `see-${slug(section.title)}`;
  const opened = opening(section, rows);
  const current =
    section.current === undefined ? opened : opened.filter(section.current);
  const stopped = opened.length - current.length;
  const names = [
    ...current.map((row) => row[section.field] ?? ""),
    ...(stopped > 0
      ? [`${current.length > 0 ? "and " : ""}${stopped} stopped`]
      : []),
  ].join(", ");
  const opener = html`<a class="tile" key=${id} href="#${id}"><span class="kind">${section.title}</span><span class="count">${current.length}</span><span class="peek">${names}</span></a>`;
  return {
    tile:
      by === undefined
        ? opener
        : html`<div class="tile-box" key=${id}>${opener}<a class="by" href=${by.href} title=${by.title}>${by.label}</a></div>`,
    dialog: box(
      id,
      html`${section.title} <span class="muted">${rows.length}</span>`,
      html`<${Table} section=${section} rows=${opened} entryHref=${entryHref} />`,
      { wide: true },
    ),
  };
}

/**
 * A pod's page, as a person reads it: the person's name, how many records from how many places, a note when a record
 * was just brought in, what is worth a look, a tile per kind with rows, each with its dialog, and a way to bring in
 * more. `answers` holds the rows of each of `QUESTIONS`, by question. The rest names what the host gives:
 *
 * - `pod`: the pod's name;
 * - `person`: the demo person the pod is for, as `demoPeople` gives them, or undefined;
 * - `from`: the hospital a record was just brought in from, by its name, or undefined;
 * - `signIn(hospital)`: a button that signs the pod's person in at one of `person`'s hospitals;
 * - `findHospital`: the address of the page that finds a hospital;
 * - `world`: what the hospitals answer as of now and the way to change it, as `worldDateLine` takes it, or undefined;
 * - `connection`: the box of a connection under way, as `connectionDialog` gives it, or undefined;
 * - `unheld`: the table versions the pod names that the app does not hold, as `pod.opened.unheld` gives them;
 * - `entryHref(entry)`: the address of an entry's page, which each row of a tile's table links to; none, no link;
 * - `about`: what the tables say of the codes `codesOf(answers)` gives, as their `about` answers, which `named` names
 *   the rows by; an empty map when they cannot say. Undefined while they are still being asked, and What changed holds
 *   only a line saying it is being named until it is known, so a card is drawn once, by one name, never by the record's
 *   own and then the tables';
 * - `said`: what the tables say of the variants, as `variantsSaid` gives it, or undefined until they can say; no report
 *   is tagged `Differs`, on a row or in what is worth a look, until it does;
 * - `changes`: what changed after a medication started or stopped, as `changesIn` gives it over the pod's medication
 *   history and lab results; none, no part, as when the pod holds no row of either;
 * - `trendHref({ test, medication })`: the address of the trend of a test, a medication marked, which a change links to;
 * - `register(view)`: called with `TREND_VIEW` while What changed is on screen, giving back what undoes it;
 * - `ask`: true when a model is set, and each change and each line of Worth a look has an "Ask about this" button.
 */
export function podPage(
  asked,
  {
    pod,
    titles,
    person,
    from,
    signIn,
    findHospital,
    world,
    connection,
    unheld = [],
    entryHref,
    about,
    held = [],
    said,
    changes,
    trendHref,
    classesHref,
    register,
    ask,
  },
) {
  const names = about ?? new Map();
  const answers = named(asked, names);
  const credits = namingCredits(asked, names, held);
  const sources = answers[SOURCES] ?? [];
  const records = new Set(sources.map((row) => row.record)).size;
  const places = [...new Set(sources.map(placeOf))];
  const worth = worthPart(
    worthALook(answers, names, said),
    entryHref,
    ask,
    about === undefined &&
      said === undefined &&
      (answers[REPORTS] ?? []).length > 0,
  );
  const due =
    changes !== undefined &&
    (answers[HISTORY] ?? []).length > 0 &&
    (answers[LABS] ?? []).length > 0;
  const changed = !due
    ? undefined
    : about === undefined
      ? html`<div class="card changes"><h2>What changed</h2>
${pending({ lines: 4, said: "Naming what changed…" })}
</div>`
      : changedPart({
          changes,
          about: names,
          how: howOf(
            asked,
            changes.filter(
              ({ direction }) => direction !== "not enough results",
            ),
          ),
          entryHref,
          trendHref,
          register,
          ask,
        });
  const tiles = SECTIONS.map((section) => [
    section,
    sectionRows(section, answers, said),
  ])
    .filter(([, rows]) => rows.length > 0)
    .map(([section, rows]) =>
      tile(
        section,
        rows,
        entryHref,
        section.one === "medication" && classesHref !== undefined
          ? {
              href: classesHref,
              label: "By class",
              title: "Which of these medicines are in a class?",
            }
          : undefined,
      ),
    );
  const lead =
    records === 0
      ? "Nothing here yet."
      : `${records} ${records === 1 ? "record" : "records"}, from ${places.length === 1 ? "one place" : `${places.length} places`}`;
  return html`<h1>${personName(pod, titles)}</h1>
<p class="lead">${lead}</p>
${places.length > 0 && html`<ul class="chips">${places.map((place) => html`<li>${place}</li>`)}</ul>`}
${from !== undefined && html`<p class="note">Brought in the record from ${hospitalName(from)}.</p>`}
${unheld.length > 0 && html`<p class="note">This pod was matched with ${unheld.length === 1 ? "a reference table version" : `${unheld.length} reference table versions`} this app does not hold, and is matched without ${unheld.length === 1 ? "it" : "them"}.</p>`}
${worth}
${changed}
${tiles.length > 0 && html`<div class="tiles">${tiles.map(({ tile }) => tile)}</div>`}
${about === undefined && tiles.length > 0 ? [pending({ lines: 3, pitch: "2rem", said: "Loading the credits…" })] : credits.map((credit) => html`<p class="muted arrive">${credit}</p>`)}
${tiles.map(({ dialog }) => dialog)}
${connection}
${bringIn({ empty: records === 0, person, signIn, findHospital, world })}`;
}

/**
 * While the component is on screen, calls `register(definition)`, and what it gives back when it goes; nothing without
 * `register`. Both happen as the page changes, never after it: a passive effect runs after the next paint, so a view
 * could be registered, or still be registered, once the page had gone.
 */
export function useView(register, definition) {
  useLayoutEffect(() => register?.(definition), [register, definition]);
}

/**
 * A line of results over time, drawn as SVG: one marker for each point, the days in `marks` (`{ time, kind, text }`) as
 * dashed lines across it, and with `axes` the days along the bottom and the numbers at the left, in `unit`. The title and
 * the description are what a screen reader says; the colours are the page's.
 */
function Chart({
  id,
  plot,
  points,
  marks = [],
  unit,
  title,
  desc,
  axes = false,
}) {
  const { width, height, margin, radius, from, to, low, high, x, y } = plot;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const right = width - margin.right;
  const bottom = height - margin.bottom;
  const days = (to - from) / DAY_MS;
  return html`<svg class="chart ${axes ? "large" : "small"}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc">
<title id="${id}-title">${title}</title>
<desc id="${id}-desc">${desc}</desc>
${axes && spread(4, low, high).map((value) => html`<line class="grid" x1=${margin.left} x2=${right} y1=${near(y(value))} y2=${near(y(value))} /><text class="tick" x=${margin.left - 8} y=${near(y(value)) + 4} text-anchor="end">${rounded(value)}</text>`)}
${axes && spread(5, from, to).map((time) => html`<text class="tick" x=${near(x(time))} y=${bottom + 20} text-anchor="middle">${days >= 150 ? monthAt(time) : dayAt(time)}</text>`)}
${axes && html`<text class="tick" transform="translate(14 ${near(margin.top + (bottom - margin.top) / 2)}) rotate(-90)" text-anchor="middle">${unit}</text>`}
${marks.map(({ time, kind, text }) => html`<line class="mark ${kind}" x1=${near(x(time))} x2=${near(x(time))} y1=${margin.top} y2=${bottom} />${axes && html`<text class="tick" x=${near(x(time))} y=${margin.top - 10} text-anchor=${x(time) > width / 2 ? "end" : "start"}>${text}</text>`}`)}
<polyline class="series" fill="none" points=${sorted.map(({ time, value }) => `${near(x(time))},${near(y(value))}`).join(" ")} />
${sorted.map(({ time, value }) => html`<circle class="marker" cx=${near(x(time))} cy=${near(y(value))} r=${radius}><title>${dayAt(time)}: ${rounded(value)} ${unit}</title></circle>`)}
</svg>`;
}

/** The medications of `drugs` as bars from their start to their stop, to the right edge while one has none, along the days of `plot`. */
function Lane({ id, plot, drugs, chosen, title, desc }) {
  const { width, margin, from, to, x } = plot;
  const rowHeight = 32;
  const height = drugs.length * rowHeight + 8;
  return html`<svg class="chart lane" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc">
<title id="${id}-title">${title}</title>
<desc id="${id}-desc">${desc}</desc>
${drugs.map((drug, at) => {
  const top = 4 + at * rowHeight;
  const start = drug.started ? timeOf(drug.started) : undefined;
  const end = drug.ended ? timeOf(drug.ended) : to;
  const drawn = start !== undefined && start <= to && end >= from;
  const left = drawn ? x(Math.max(start, from)) : margin.left;
  const across = drawn ? Math.max(2, x(Math.min(end, to)) - left) : 0;
  const on = drug === chosen;
  return html`<text class="lane-label${on ? " chosen" : ""}" x=${margin.left} y=${top + 11}>${drug.name}</text>${drawn && html`<rect class="bar${on ? " chosen" : ""}" x=${near(left)} y=${top + 16} width=${near(across)} height="8" rx="4"><title>${drug.name}: ${drug.started ? `from ${day(drug.started)}` : "start not known"}${drug.ended ? ` to ${day(drug.ended)}` : ", not stopped"}</title></rect>`}`;
})}
</svg>`;
}

function Trend({
  pod,
  titles,
  back,
  labs,
  series,
  timeline,
  test,
  medication,
  trendHref,
  about = new Map(),
  register,
  ask,
}) {
  useView(register, TREND_VIEW);
  const backLink = html`<p><a href=${back}>Back to ${personName(pod, titles)}</a></p>`;
  if (series === undefined)
    return html`${backLink}
<h1>Not found</h1>
<p>${test === undefined ? "This pod holds no lab results to show a trend of." : `This pod holds no results for the test ${test}.`}</p>`;
  const name = trendTitle(series, about);
  const drugs = therapiesOf(timeline, about);
  const wanted = medication?.toLowerCase();
  const chosen =
    medication === undefined
      ? undefined
      : drugs.find(
          (drug) =>
            drug.key === medication ||
            drug.code === medication ||
            drug.name.toLowerCase() === wanted,
        );
  const unit = unitOf(series.results);
  const drawn = series.results.filter((result) => result.unit === unit);
  const points = drawn.map(({ date, value }) => ({
    time: timeOf(date),
    value,
  }));
  const marks =
    chosen === undefined
      ? []
      : [
          chosen.started && {
            time: timeOf(chosen.started),
            kind: "start",
            text: `${chosen.name} started`,
          },
          chosen.ended && {
            time: timeOf(chosen.ended),
            kind: "stop",
            text: `${chosen.name} stopped`,
          },
        ].filter(Boolean);
  const link = (given) =>
    trendHref({
      test: series.test.notation ?? series.test.code,
      ...(chosen ? { medication: chosen.key } : {}),
      ...given,
    });
  const left = leftSaid(series.left);
  const unplotted = series.results.length - drawn.length;
  let chart;
  if (points.length > 0) {
    const plot = plotOf({ points, marks, size: LARGE });
    const values = points.map(({ value }) => value);
    const described = `${resultsSaid(points.length)} from ${dayAt(Math.min(...points.map(({ time }) => time)))} to ${dayAt(Math.max(...points.map(({ time }) => time)))}, from ${rounded(Math.min(...values))} to ${rounded(Math.max(...values))} ${unit}.${marks.map(({ time, text }) => ` ${text} ${dayAt(time)}.`).join("")}`;
    chart = html`<${Chart} id="trend-chart" plot=${plot} points=${points} marks=${marks} unit=${unit} title=${name} desc=${described} axes />
<${Lane} id="trend-lane" plot=${plot} drugs=${drugs} chosen=${chosen} title="Medications" desc=${drugs.length === 0 ? "No medication." : drugs.map((drug) => `${drug.name}${drug.started ? ` from ${dayAt(timeOf(drug.started))}` : ", start not known"}${drug.ended ? ` to ${dayAt(timeOf(drug.ended))}` : ", not stopped"}.`).join(" ")} />`;
  }
  const picked = (on) => (on ? "true" : undefined);
  return html`${backLink}
<h1>${name}</h1>
<p class="lead">${series.results.length === 0 ? "No result of this test is a number." : `${resultsSaid(series.results.length)}${unit === "" ? "" : `, in ${unit}`}`}${ask && askButton({ kind: "trend", test: series.test.notation ?? series.test.code, ...(chosen ? { medication: chosen.key } : {}) }, chosen ? `${name} and ${chosen.name}` : name)}</p>
${medication !== undefined && chosen === undefined && html`<p class="note">This pod holds no medication ${medication}.</p>`}
${chart && html`<div class="card trend">${chart}${unplotted > 0 && html`<p class="muted">The chart leaves out ${resultsSaid(unplotted)} in another unit; the table lists ${unplotted === 1 ? "it" : "them"}.</p>`}</div>`}
<div class="card"><h2>Results</h2>
${left && html`<p class="muted">${left}</p>`}
<div class="scroll"><table>
<thead><tr><th>Date</th><th>Value</th><th>Unit</th></tr></thead>
<tbody>
${series.results.map((result) => html`<tr><td>${day(result.date)}</td><td>${rounded(result.value)}</td><td>${result.unit}</td></tr>`)}
</tbody>
</table></div></div>
<div class="card picker"><h2>Show</h2>
<h3>Test</h3>
<ul>${testsIn(labs).map((each) => html`<li><a href=${link({ test: each.notation ?? each.code })} aria-current=${picked((each.notation ?? each.code) === (series.test.notation ?? series.test.code))}>${each.name ?? each.notation ?? each.code}</a></li>`)}</ul>
<h3>Medication marked</h3>
<ul><li><a href=${trendHref({ test: series.test.notation ?? series.test.code })} aria-current=${picked(chosen === undefined)}>None</a></li>
${drugs.map((drug) => html`<li><a href=${link({ medication: drug.key })} aria-current=${picked(drug === chosen)}>${drug.name}</a></li>`)}</ul>
</div>`;
}

/**
 * The trend of one test, a medication marked: a chart of the results with the days the medication started and stopped
 * dashed across it, each medication as a bar under it, a table of the results and links to pick another test or
 * medication. It states what changed after what, never why.
 *
 * - `pod`, `back`: the pod's name and the address of its page;
 * - `labs`: the rows of `pod/My lab results`, for the tests to pick from;
 * - `series`: `labSeriesIn`'s answer for the test, or undefined when the pod holds none: the page says so;
 * - `timeline`: `timelineIn`'s answer over the pod's medication history;
 * - `test`, `medication`: as asked; `medication` is a bare RxNorm code, or a name, and none is marked when it names
 *   none the pod holds;
 * - `trendHref({ test, medication })`: the address of a trend, which the links of the picker go to;
 * - `about`: what the tables say of the codes of the pod's lab results and medication history, as the card names them;
 *   the page names the test and the medications by it where it names the code, else by the record's own text;
 * - `register(view)`: as `podPage` takes it;
 * - `ask`: as `podPage` takes it; the page has an "Ask about this" button for the test and the medication marked.
 */
export function trendPage(props) {
  return html`<${Trend} ...${props} />`;
}

/** One finding as a card: what changed, the means, what was left out, a small chart and the links to its results and trend. */
function Change({ finding, names, trendHref, ask }) {
  const { key, kind, unit, before, after, left, rows } = finding;
  const id = `change-${slug(key)}`;
  const points = [...rows.before, ...rows.after].map((row) => ({
    time: timeOf(row.performed),
    value: Number(row.value),
  }));
  const marks = [
    {
      time: timeOf(finding.medication.date),
      kind: kind === "after start" ? "start" : "stop",
      text: "",
    },
  ];
  const plot = plotOf({ points, marks, size: SMALL });
  const sentence = sentenceOf(finding, names);
  const forgone = leftSaid(left);
  const shown = rows.before.length + rows.after.length + rows.left.length;
  return html`<div class="change">
<p class="said">${sentence}</p>
<p>${rounded(before.mean)} → ${rounded(after.mean)} ${unit}, the mean of ${resultsSaid(before.count)} before and ${after.count} after.</p>
${forgone && html`<p class="muted">${forgone}</p>`}
<${Chart} id=${id} plot=${plot} points=${points} marks=${marks} unit=${unit} title=${names.test} desc="${resultsSaid(points.length)} from ${dayAt(Math.min(...points.map((point) => point.time)))} to ${dayAt(Math.max(...points.map((point) => point.time)))}. ${names.medication} ${kind === "after start" ? "started" : "stopped"} ${day(finding.medication.date)}." />
<p class="row"><a href="#${id}">Show the ${resultsSaid(shown)}</a>${trendHref !== undefined && html` <a href=${trendHref(trendOfFinding(finding))}>Open the trend</a>`}${ask && askButton({ kind: "finding", key }, sentence)}</p>
</div>`;
}

/** The mechanism behind What changed, as `howOf` gives it: the pulls in order, and each medication's versions. */
function How({ how, about }) {
  return html`<div class="how">
<h3>Where this comes from</h3>
<p>The pod's records came in ${how.pulls.length} imports, in this order:</p>
<ol>${how.pulls.map((pull) => html`<li>${pullSaid(pull)}</li>`)}</ol>
${how.revisions.flatMap(({ finding, steps }) => steps.map((step) => html`<p>${capitalised(changeNames(finding, about).medication)} came in a new version: version ${step.from} to version ${step.to}, in import ${step.pull}, ${step.asOf === undefined ? `on ${localDay(step.arrived)}` : `as of ${dayInWords(step.asOf)}`}.${step.said.length > 0 && html` ${capitalised(step.said.map(({ field, before, after }) => `${field} ${valuesSaid(before)} → ${valuesSaid(after)}`).join("; "))}.`}</p>`))}
</div>`;
}

function Changed({ changes, about, how, entryHref, trendHref, register, ask }) {
  useView(register, TREND_VIEW);
  const shown = changes.filter(
    ({ direction }) => direction !== "not enough results",
  );
  const thin = changes.filter(
    ({ direction }) => direction === "not enough results",
  );
  const boxes = shown.map((finding) => {
    const { rows } = finding;
    const all = [...rows.before, ...rows.after, ...rows.left];
    return box(
      `change-${slug(finding.key)}`,
      `${changeNames(finding, about).test} results`,
      html`${rows.left.length > 0 && html`<p class="muted">${rows.left.length} of these ${rows.left.length === 1 ? "was" : "were"} left out of the means.</p>`}
<${Table} section=${LAB_SECTION} rows=${opening(LAB_SECTION, all)} entryHref=${entryHref} />`,
      { wide: true },
    );
  });
  if (thin.length > 0)
    boxes.push(
      box(
        "too-few",
        "Too few results to say anything",
        html`<ul>${thin.map((finding) => {
          const names = changeNames(finding, about);
          return html`<li>${capitalised(names.test)} and ${names.medication}, ${finding.kind === "after start" ? "started" : "stopped"} ${day(finding.medication.date)}: ${resultsSaid(finding.before.count)} before, ${finding.after.count} after.${trendHref !== undefined && html` <a href=${trendHref(trendOfFinding(finding))}>Open the trend</a>`}</li>`;
        })}</ul>`,
      ),
    );
  return html`<div class="card changes"><h2>What changed</h2>
${shown.length === 0 ? html`<p>Nothing stands out yet.</p>` : shown.map((finding) => html`<${Change} key=${finding.key} finding=${finding} names=${changeNames(finding, about)} trendHref=${trendHref} ask=${ask} />`)}
${thin.length > 0 && html`<p>${thin.length} ${thin.length === 1 ? "pair" : "pairs"} of a medication and a test had too few results to say anything. <a href="#too-few">Show ${thin.length === 1 ? "it" : "them"}</a></p>`}
${shown.length > 0 && how !== undefined && html`<${How} how=${how} about=${about} />`}
<p class="muted">These say what changed after what, never why. A clinician can say why.</p>
</div>
${boxes}`;
}

/**
 * The part of a pod's page that says what changed in its lab results after a medication started or stopped, as
 * `changesIn` gives it: a card for each change, strongest first, with its means, a small chart and links to the results
 * behind it and to its trend; one line for the pairs with too few results to say anything. `about`, `entryHref`,
 * `trendHref`, `register` and `ask` are as `podPage` takes them; with `ask`, each card has an "Ask about this" button
 * carrying its finding's key. With `how`, as `howOf` gives it, the card says how the pod came to hold what it reads: the
 * pulls in order and the medication's versions.
 */
export function changedPart(props) {
  return html`<${Changed} ...${props} />`;
}

/**
 * The card that brings in more: a sign-in button per hospital holding the demo person, and "Find a hospital". It
 * says nothing of what a hospital holds: nothing here asks it. With `world`, the date the hospitals answer as of and the
 * way to change it come first, where a sign-in begins.
 */
function bringIn({ empty, person, signIn, findHospital, world }) {
  return html`<div class="card">
<h2>${empty ? "Bring in records" : "Bring in more"}</h2>
<p>Sign in at a hospital, see what it has, and bring it into this pod.</p>
${world !== undefined && worldDateLine(world)}
<div class="row">${(person?.at ?? []).map(signIn)}<a class="button quiet" href=${findHospital}>Find a hospital</a></div>
</div>`;
}

/**
 * An entry's page, as a person reads it: its name and tags, what it is, where it came from and what else is known, each
 * part absent when it has nothing to say but where it came from. `entry` is `entryOf`'s answer, none when the entry is
 * not in the pod. `back` is the pod's address; a code with a series is a link to `codeHref(series, notation)`, and
 * the version a table's claim comes from a link to `tableHref(series)`. With `ask`, as `podPage` takes it, the page has
 * an "Ask about this" button for the entry. A lab result's `panels` (`panelsOf`'s answer, none until the tables can
 * say) are the panels LOINC lists its test in, each a link to `panelHref(code)`.
 */
export function entryPage({
  entry,
  pod,
  titles,
  back,
  codeHref,
  tableHref,
  ask,
  panels = [],
  panelHref,
}) {
  const backLink = html`<p><a href=${back}>Back to ${personName(pod, titles)}</a></p>`;
  if (entry === undefined)
    return html`${backLink}
<h1>Not found</h1>
<p>This entry is no longer in this pod.</p>`;
  const { name, kind, tags, what, recorded, codes, known, credits } = entry;
  const facts = [
    ...(recorded === undefined
      ? []
      : [{ head: "Recorded as", text: recorded }]),
    ...what,
  ];
  const shown = (code, at) =>
    html`${at > 0 && ", "}${code.series === undefined ? code.notation : html`<a href=${codeHref(code.series, code.notation)}>${code.notation}</a>`}`;
  return html`${backLink}
<h1>${name}${tags.map(tagged)}</h1>
<p class="lead">${capitalised(kind)}${ask && askButton({ kind: "entry", id: entryId(entry.entry) }, name)}</p>
${
  (facts.length > 0 || codes.length > 0) &&
  html`<div class="card entry"><h2>What it is</h2><dl class="facts">
${facts.map(({ head, text }) => html`<dt>${head}</dt><dd>${text}</dd>`)}
${codes.length > 0 && html`<dt>${codes.length === 1 ? "Code" : "Codes"}</dt><dd>${codes.map(shown)}</dd>`}
</dl></div>`
}
<div class="card entry"><h2>Where it came from</h2><ul>
${entry.where.map(
  ({ place, issued, retrieved, arrived, importLabel, records }) =>
    html`<li><strong>${place}</strong> <span class="muted">${[
      issued !== undefined && `report of ${day(issued)}`,
      retrieved !== undefined && `retrieved ${localDay(retrieved)}`,
      arrived !== undefined &&
        `arrived ${localDay(arrived)}${importLabel === undefined ? "" : ` through ${importLabel}`}`,
      records > 1 && `${records} records`,
    ]
      .filter(Boolean)
      .join("; ")}</span></li>`,
)}
</ul></div>
${
  known.length > 0 &&
  html`<div class="card entry"><h2>What else is known</h2><ul>
${known.map(
  ({ sentence, tag, from, fromLead = "From" }) =>
    html`<li>${sentence}${tag !== undefined && tagged(tag)}${from !== undefined && html` <span class="muted from">${fromLead} ${from.series.label}, <a href=${tableHref(from.series)}>${versionName(from.version)}</a>.</span>`}</li>`,
)}
</ul>${credits.map((credit) => html`<p class="muted">${credit}</p>`)}</div>`
}
${panels.map(
  ({ series, version, total, panels: listing }) =>
    html`<div class="card entry"><h2>In LOINC panels</h2>
<p>${series.label} lists this test in ${total === 1 ? "one panel" : `${total.toLocaleString("en")} panels`}. A panel's page shows the results you have in it; it does not say this result was drawn as part of one.</p>
<ul class="members">${listing.map(
      (each) =>
        html`<li><a href=${panelHref(each.code)}>${each.about?.name?.label ?? each.notation}</a>${each.required !== undefined && html` <span class="muted">${REQUIRED[each.required] ?? each.required}</span>`}</li>`,
    )}</ul>
${total > listing.length && html`<p class="muted">and ${(total - listing.length).toLocaleString("en")} more.</p>`}
${series.credit !== undefined && html`<p class="muted">${series.credit}</p>`}
<p class="muted from">From ${series.label}, <a href=${tableHref(series)}>${versionName(version)}</a>.</p></div>`,
)}`;
}

/**
 * Where a connection has got to, as a list of steps: those done ticked, the one under way marked. While its record is
 * brought in, `bringing` is the import's part, as `onProgress` last said it.
 */
export function steps({ step, requests, bringing }) {
  const at = ["signing in", "pulling", "pulled", "bringing in"].indexOf(step);
  const items = [
    at === 0 ? "Signing in at the hospital" : "Signed in at the hospital",
    at === 1
      ? `Fetching the record: ${requests} requests answered so far`
      : "Fetching the record",
    at === 2 ? `Record fetched, in ${requests} requests` : "Record fetched",
    ...(at === 3
      ? [
          `Bringing it in${bringing === undefined ? "" : `: ${importPart(bringing)}`}`,
        ]
      : []),
  ].map((text, index) => {
    const state = index < at || at === 2 ? "done" : index === at ? "now" : "";
    return html`<li class=${state}>${text}</li>`;
  });
  return html`<ul class="steps">${items}</ul>`;
}

/**
 * `steps` of `connection`, which in a browser draws itself again once a frame while the connection signs in, fetches or
 * brings its record in, so the host only counts `connection.requests` or sets `connection.bringing` and the page around
 * it is not drawn again.
 */
function Steps({ connection }) {
  const [, setSeen] = useState();
  useEffect(() => {
    if (!["signing in", "pulling", "bringing in"].includes(connection.step))
      return;
    let frame;
    const again = () => {
      setSeen(JSON.stringify([connection.requests, connection.bringing]));
      frame = globalThis.requestAnimationFrame(again);
    };
    again();
    return () => globalThis.cancelAnimationFrame(frame);
  }, [connection, connection.step]);
  return steps(connection);
}

/**
 * A button that posts `fields` to `action`, as a form of its own, with `inner` in it; `doing` is what the page says
 * while the form is posted.
 */
export function postButton(action, fields, inner, className, doing) {
  return html`<form class="inline" method="post" action=${action} data-doing=${doing}>
${Object.entries(fields).map(([name, value]) => html`<input type="hidden" name=${name} value=${value} />`)}
<button class=${className}>${inner}</button>
</form>`;
}

/**
 * A one-click choice in a list of the new-pod box: a form that posts `fields` to `action`, saying `doing` while it
 * does, or a link to `href`.
 */
function choice({ label, note, action, fields = {}, href, doing }) {
  const inner = html`${label}<span class="muted">${note ?? ""}</span>`;
  return html`<li>${href === undefined ? postButton(action, fields, inner, undefined, doing) : html`<a class="button" href=${href}>${inner}</a>`}</li>`;
}

/**
 * On the document `page`, rendered to a string: a form of the new-pod box submitted with its checkbox ticked carries
 * `encrypt=on`, so whichever way the pod is made says it is to be encrypted.
 */
export function encryptedChoice(page) {
  page.addEventListener("submit", (event) => {
    const form = event.target;
    if (!form.closest?.("#new-pod")) return;
    form.querySelector('input[name="encrypt"]')?.remove();
    if (!page.getElementById("encrypt-pod")?.checked) return;
    const field = page.createElement("input");
    field.type = "hidden";
    field.name = "encrypt";
    field.value = "on";
    form.append(field);
  });
}

/**
 * On the document `page`, rendered to a string: a button marked `data-copy-words` copies the words in its form's
 * password field to the clipboard and says so in the form's `data-copied` line; where the clipboard is not
 * available it says to write the words down, and fails nowhere.
 */
export function copyWords(page) {
  page.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-copy-words]");
    if (!button) return;
    const form = button.form;
    const words = form?.querySelector('input[name="password"]')?.value;
    const note = form?.querySelector("[data-copied]");
    try {
      await globalThis.navigator.clipboard.writeText(words);
      if (note) note.textContent = "Copied";
    } catch {
      if (note)
        note.textContent = "Copy isn't available here; write the words down.";
    }
  });
}

/**
 * The first step of making an encrypted pod for `pod`: the `words` (six, separated by spaces) large and numbered,
 * what to do with them, and a form posting to `action` that asks for words 2 and 5. The form carries the pod's name
 * and, in two visible fields a password manager reads as a sign-up (`username`, `password`), the name and the words;
 * the receiver refuses a form where either has changed. `problem`, when given, says what the last try got wrong.
 * Nothing is made until the form is answered.
 */
export function sixWordsPage({ pod, titles, words, action, problem }) {
  return html`<h1>Your six words</h1>
<p class="lead">For ${personName(pod, titles)}'s pod.</p>
<ol class="words">${words.split(" ").map((word) => html`<li>${word}</li>`)}</ol>
<p>Write these down, or save them in your password manager. They are the only way into this pod. Nobody can recover them: if you lose them, the pod's records are gone for good.</p>
<p class="muted">Encryption hides what the records say. It does not hide that this pod exists, its name, how many files it has or their sizes.</p>
${problem !== undefined && html`<p class="note" role="alert">${problem}</p>`}
<form method="post" action=${action} class="stack" data-doing="Making the pod…" autocomplete="on">
<input type="hidden" name="pod" value=${pod} />
<label>Pod <input type="text" name="username" autocomplete="username" value=${pod} /></label>
<label>Password <input type="password" name="password" autocomplete="new-password" value=${words} /></label>
<p class="muted">Your password manager can save these as the pod's password. <button type="button" data-copy-words>Copy words</button> <span data-copied role="status"></span></p>
<p><strong>Check that you have them.</strong> Type the second and the fifth word.</p>
<label>Word 2 <input name="word2" autocomplete="off" autocapitalize="none" spellcheck="false" required /></label>
<label>Word 5 <input name="word5" autocomplete="off" autocapitalize="none" spellcheck="false" required /></label>
<p><button>Make the encrypted pod</button></p>
</form>`;
}

/**
 * The page at any address of the encrypted pod `pod` while it is not open. `outcome` is how it last failed to open:
 * "secret needed" before any words were given, else an `Unopened` outcome. Where words could still open it, the page
 * has a form posting to `action` (with `next`, the address to go to once it opens), whose `username` and
 * `current-password` fields a password manager fills; otherwise only the outcome's sentence.
 */
export function openPodPage({ pod, titles, outcome, action, next }) {
  const said = UNOPENED[outcome];
  const wordsHelp =
    outcome === "secret needed" || outcome === "incorrect secret";
  return html`<h1>Open ${personName(pod, titles)}'s pod</h1>
${wordsHelp ? html`<p>This pod is encrypted. Type its six words to open it.</p>` : null}
${said !== undefined && html`<p class="note" role="alert">${said}</p>`}
${
  wordsHelp &&
  html`<form method="post" action=${action} class="stack" data-doing="Opening the pod…" autocomplete="on">
<input type="hidden" name="next" value=${next} />
<label>Pod <input type="text" name="username" autocomplete="username" value=${pod} /></label>
<label>Your six words <input type="password" name="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required /></label>
<p><button>Open this pod</button></p>
</form>`
}`;
}

/**
 * The box that makes a new pod, shown when the page's address ends `#new-pod`: what a pod is, a button for each demo
 * person in `people` with no pod among `pods` yet, `more` when given (`{ said, choices }`, each choice a `label`, a
 * `note`, and an `action` with its `fields` or an `href`), and a field for anyone's name. A person's button and the
 * field post `person` to `action`.
 */
export function newPodDialog({ people, pods, action, more }) {
  const demo = byFamily(people)
    .filter((person) => !pods.includes(slug(person.name)))
    .map((person) =>
      choice({
        label: familyFirst(person),
        note: `Records waiting at ${listed(person.at.map(({ name }) => hospitalName(name)))}`,
        action,
        fields: { person: person.name },
        doing: `Making ${person.name}'s pod…`,
      }),
    );
  const list = (said, items) =>
    items.length > 0 &&
    html`<p><strong>${said}</strong></p>
<ul class="people">${items}</ul>`;
  return box(
    "new-pod",
    "Make a new pod",
    html`<p>A pod keeps one person's health records, wherever they come from: files they download, and hospitals they sign in to. It notices when two sources describe the same thing, and when they disagree.</p>
<p class="encrypt"><label><input type="checkbox" id=${ENCRYPT_BOX} /> Encrypt this pod with six words</label>
<span class="muted">You get six words to keep. Only they open the pod again.</span></p>
${list("Try someone with records waiting at the demo hospitals. They are made up, and signing in needs no password.", demo)}
${more !== undefined && list(more.said, more.choices.map(choice))}
<p><strong>Or make one for anyone.</strong> You can bring in records afterwards.</p>
<form method="post" action=${action} class="row" data-doing="Making the pod…">
<input name="person" placeholder="A person's name" aria-label="A person's name" required />
<button>Make the pod</button>
</form>`,
  );
}

/** A menu of the title bar: `<details>`, so it opens and closes with no script, each item a link to a box. */
function menu(name, items) {
  return html`<details class="menu"><summary>${name}</summary><ul>
${items.map(([href, label]) => html`<li><a href=${href}>${label}</a></li>`)}
</ul></details>`;
}

/**
 * The title bar's menus and their boxes: File's two items each open a box asking to confirm, whose one button posts
 * to `deleteAll` or `resetAll`; Help's About gives the application's `name` and `version`, the `runtime` version it is
 * built on, and a link to its `code`.
 */
function menus({ deleteAll, resetAll, about }) {
  return {
    bar: html`${menu("File", [
      ["#delete-all", "Delete all data"],
      ["#reset-all", "Reset all data"],
    ])}${menu("Help", [["#about", "About"]])}`,
    boxes: [
      box(
        "delete-all",
        "Delete all data?",
        html`<p>Every pod in this app goes.</p>
${postButton(deleteAll, {}, "Delete all data", "warm", "Deleting all data…")}`,
      ),
      box(
        "reset-all",
        "Reset all data?",
        html`<p>Every pod goes, and Alex's, Priya's, Martin's and Tamsin's are loaded again.</p>
${postButton(resetAll, {}, "Reset all data", "warm", "Resetting all data…")}`,
      ),
      box(
        "about",
        `About ${about.name}`,
        html`<p><strong>${about.name}</strong> ${about.version}</p>
<p>Built on cascade-runtime ${about.runtime}.</p>
<p>Every person here is made up.</p>
${about.code !== undefined && html`<p><a href=${about.code}>The code</a></p>`}`,
      ),
    ],
  };
}

/**
 * What a page shows, without the document around it, which a page in a browser renders into its own root: the title
 * bar with its menus, the pods by their people's names, `note` above `body` when given, and `dialog` (the new-pod
 * box). `pods` are the pods' names, `current` the one shown, `href(pod)` a pod's address and `home` the title bar's;
 * `menu` is what the menus need, as `{ deleteAll, resetAll, about: { name, version, runtime, code } }`: the addresses
 * the two File items post to, and what the About box says. `tables`, when given, puts the reference tables under the
 * pods, as `tablesNav` takes them.
 */
export function layout({
  body,
  pods,
  titles,
  current,
  href,
  home,
  dialog,
  menu,
  note,
  tables,
}) {
  const { bar, boxes } = menus(menu);
  return html`<${Fragment}>
<header class="bar"><a href=${home}>Cascade</a>${bar}<span class="demo">Demo: every person here is made up</span></header>
<div class="layout">
<aside>
<nav><h2>Pods</h2><ul>
${pods.map((pod) => html`<li><a href=${href(pod)} aria-current=${pod === current ? "page" : undefined}>${personName(pod, titles)}</a></li>`)}
</ul></nav>
<a class="button wide" href="#new-pod">+ New pod</a>
${tables !== undefined && tablesNav(tables)}
</aside>
<main>
${note !== undefined && html`<p class="note" role="status">${note}</p>`}
${body}
</main>
</div>
${dialog}
${boxes}
<//>`;
}

/**
 * A whole page: `layout` in a document titled `title`, with the stylesheet and the page's script. `refresh`, an address
 * with no fragment, makes the page go there every second: a refresh to the page's own address with a fragment only
 * goes to the fragment. Render it to a string after `<!doctype html>`.
 */
export function frame({ title, refresh, chat, ...shown }) {
  return html`<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${refresh && html`<meta http-equiv="refresh" content=${`1; url=${refresh}`} />`}
<title>${title} · Cascade</title>
<style dangerouslySetInnerHTML=${{ __html: STYLE + (chat === undefined ? "" : CHAT_STYLE) }}></style>
</head>
<body>
${layout(shown)}
${chat !== undefined && !refresh && html`<${Chat} ...${chat} />`}
${doing()}
<script dangerouslySetInnerHTML=${{ __html: SCRIPT }}></script>
</body>
</html>`;
}

/** A part that has not arrived: `lines` faint bars hold its space, `pitch` apart, and `said` is the one line a screen reader reads. */
export function pending({ lines, said, pitch }) {
  return html`<div class="pending" aria-busy="true" style=${pitch && `--pitch: ${pitch}`}><p role="status">${said}</p>${Array.from({ length: lines }, () => html`<span></span>`)}</div>`;
}

/** What a page says while it is busy: a spinner and `said`, one line; hidden while `said` is undefined. */
export function doing(said) {
  return html`<p class="doing" role="status" hidden=${said === undefined}><span class="spinner" aria-hidden="true"></span><span class="said">${said}</span></p>`;
}

/**
 * The chat strip at the bottom of a page, which `chatStrip` fills in the browser. `model` is `{ provider, name, local }`
 * of the model the app was set up with, or nothing, when the strip only says how to set one; `pod` the name of the pod
 * the page is about, or ""; `suggestions` the questions offered in an empty chat, as texts; `encrypted` that the pod is
 * encrypted, so the strip keeps no chat of it beyond the page.
 */
export function Chat({ model, pod, suggestions = [], encrypted = false }) {
  if (!model)
    return html`<section class="chat" aria-label="Chat"><p class="chat-off">To chat with a model about these pods, run <code>npm run model</code>.</p></section>`;
  return html`<section class="chat" aria-label="Chat" data-pod=${pod} data-encrypted=${encrypted ? "true" : undefined}>
<div class="chat-bar">
<strong>Chat</strong>
<span class="muted">${model.name}${model.local ? ", on this computer" : `, from ${model.provider}`}</span>
<details class="chat-recent"><summary>Recent chats</summary><ul></ul></details>
<button type="button" class="quiet chat-new">New chat</button>
<button type="button" class="quiet chat-fold" aria-expanded="true">Hide chat</button>
</div>
<div class="chat-about muted" hidden></div>
<div class="chat-log" role="log" aria-live="polite" hidden></div>
<div class="chat-chips" hidden>
${suggestions.map((text) => html`<button type="button" class="quiet" data-ask-text=${text}>${text}</button>`)}
</div>
<form class="chat-form">
<input name="text" autocomplete="off" aria-label="Ask a question" placeholder=${pod === "" ? "Ask about your pods" : "Ask about this pod"} />
<button type="submit" class="chat-send">Send</button>
<button type="button" class="quiet chat-stop" hidden>Stop</button>
</form>
</section>`;
}

/** The page when there is no pod yet. */
export function noPods() {
  return html`<h1>No pods yet</h1>
<p class="lead">A pod keeps one person's health records, wherever they come from.</p>
<p><a class="button" href="#new-pod">Make your first pod</a></p>`;
}

/**
 * Finding a hospital for the pod `pod`: a search box that sends `q` to `search`, then a card per directory row in
 * `rows`, with its places, `signIn(row)` (its sign-in button), and the demo people in `people` it holds, each with
 * where else they are. `back` is the pod's address. `world` is the date the hospitals answer as of and the way to change
 * it, as `worldDateLine` takes it, shown above the cards.
 */
export function hospitalsPage({
  world,
  pod,
  titles,
  rows,
  text,
  search,
  signIn,
  people,
  back,
}) {
  const who = personName(pod, titles);
  const cards = rows.map((row) => {
    const here = byFamily(people)
      .filter((person) =>
        person.at.some((each) => each.fhirBase === row.fhirBase),
      )
      .map((person) => {
        const elsewhere = person.at
          .filter((each) => each.fhirBase !== row.fhirBase)
          .map(({ name }) => hospitalName(name));
        return html`<li>${familyFirst(person)}${elsewhere.length > 0 && html` <span class="muted">also at ${listed(elsewhere)}</span>`}</li>`;
      });
    return html`<div class="card">
<div class="row"><h2>${hospitalName(row.name)}</h2>${signIn(row)}</div>
${row.places !== undefined && html`<p class="muted">${row.places.join("; ")}</p>`}
${
  here.length === 0
    ? html`<p class="muted">A test server: you choose a patient on its own sign-in page.</p>`
    : html`<p class="muted">Sample patients here:</p>
<ul>${here}</ul>`
}
</div>`;
  });
  return html`<h1>Find a hospital</h1>
<p class="lead">Sign in on the hospital's own page, see what it has, and bring it into ${who}'s pod.</p>
${world !== undefined && worldDateLine(world)}
<form method="get" action=${search} class="row card" data-doing="Searching…"><input name="q" value=${text} placeholder="Search by name or place" aria-label="Search by name or place" /><button>Search</button></form>
${cards.length === 0 ? html`<p class="muted">No hospital matches.</p>` : cards}
<p><a href=${back}>Back to ${who}</a></p>`;
}

/**
 * The sidebar's reference tables, under the pods: `series` the sources the app holds, as `sourcesOf` gives them, each a
 * link to `href(source)`, the one whose IRI is `current` marked; and a Check now button posting to `check`. While
 * `loading`, a page that has not yet read what the app holds says so instead of "None yet", which says there are none,
 * and when `failed`, the read failed, which it says instead of both.
 */
export function tablesNav({
  series,
  current,
  href,
  check,
  loading = false,
  failed = false,
}) {
  return html`<section class="tables" aria-label="Reference tables"><h2>Reference tables</h2>
${
  series.length > 0
    ? html`<ul>
${series.map((each) => html`<li><a href=${href(each)} aria-current=${each.iri === current ? "page" : undefined}>${each.label}</a></li>`)}
</ul>`
    : failed
      ? html`<p class="muted">The reference tables could not be read.</p>`
      : loading
        ? pending({
            lines: 6,
            pitch: "2.34rem",
            said: "Loading the reference tables…",
          })
        : html`<p class="muted">None yet.</p>`
}
${postButton(check, {}, "Check now", "quiet wide", "Checking the feeds…")}
</section>`;
}

/** `text`, a link to `iri` when a feed gave a web address, never another scheme. */
function linked(iri, text) {
  return /^https?:\/\//.test(iri) ? html`<a href=${iri}>${text}</a>` : text;
}

/** Who publishes `series`, the credit it asks for, its licence and how fresh it is at `now`, as a card headed `heading`. */
function published(series, now, heading) {
  return html`<div class="card">${heading && html`<h2>${heading}</h2>`}<dl class="facts">
<dt>Source</dt><dd>${series.publisher !== undefined && linked(series.publisher, series.publisherName ?? series.publisher.replace(/^[a-z]+:\/\/([^/]+).*$/, "$1"))}${series.credit !== undefined && html` <span class="muted">${series.credit}</span>`}</dd>
<dt>Licence</dt><dd>${series.licence === undefined ? "Not stated" : linked(series.licence, LICENCES[series.licence] ?? series.licence)}</dd>
<dt>Fresh</dt><dd>${freshness(series, now)}</dd>
</dl></div>`;
}

/** A search box sending `q` to `search`, with `text` in it. */
function searchBox(search, text) {
  return html`<form method="get" action=${search} class="row card" data-doing="Searching…"><input name="q" value=${text} placeholder="Search by code or name" aria-label="Search by code or name" /><button>Search</button></form>`;
}

/**
 * The codes `searched` found (`search()`'s answer), page `page` of them, as a table headed `heads` with a row of cells
 * `row(found)` each, and links to the pages before and after it at `pageHref(page)`.
 */
function codesFound({ searched, page, pageHref, heads, row }) {
  const { found, total, offset = 0, size } = searched;
  if (total === 0) return html`<p class="muted">No code matches.</p>`;
  const counted = (count) =>
    `${count.toLocaleString("en")} ${count === 1 ? "code" : "codes"}`;
  const shown =
    found.length === 0
      ? `None on page ${page} of ${counted(total)}.`
      : offset === 0 && found.length === total
        ? `${counted(total)}.`
        : `${(offset + 1).toLocaleString("en")}–${(offset + found.length).toLocaleString("en")} of ${counted(total)}.`;
  // A page past the last steps back to the last.
  const previous =
    found.length === 0 ? Math.max(1, Math.ceil(total / size)) : page - 1;
  const pages = [
    offset > 0 && html`<a href=${pageHref(previous)} rel="prev">Previous</a>`,
    offset + found.length < total &&
      html`<a href=${pageHref(page + 1)} rel="next">Next</a>`,
  ].filter(Boolean);
  return html`<p class="muted">${shown}</p>
${
  found.length > 0 &&
  html`<div class="scroll"><table class="codes">
<thead><tr>${heads.map((head) => html`<th>${head}</th>`)}</tr></thead>
<tbody>
${found.map((each) => html`<tr>${row(each)}</tr>`)}
</tbody>
</table></div>`
}
${pages.length > 0 && html`<p class="pages">${pages}</p>`}`;
}

/** A code's name, with its other names after it. */
function namesOf(about) {
  return html`${about?.name?.label}${
    (about?.name?.altLabels.length ?? 0) > 0 &&
    html` <span class="muted">${about.name.altLabels.join("; ")}</span>`
  }`;
}

/**
 * A reference table's page: `series` as `held()` gives it, its source, licence, version and how fresh it is at `now`;
 * a search box sending `q` to `search`, with `text` in it; the codes `searched` found (`search()`'s answer), page
 * `page` of them, each a link to `codeHref(notation)` when given, with links to the pages before and after it at
 * `pageHref(page)`; and each version held with the pods among `pods` that `uses` (`uses()`'s answer) says were opened
 * with it, each a link to `href(pod)`.
 */
export function tablePage({
  series,
  searched,
  text,
  search,
  page = 1,
  pageHref,
  codeHref,
  uses,
  pods,
  titles,
  href,
  now,
}) {
  const maps = searched.found.some((each) => each.mapsTo.length > 0);
  const named = ({ notation, about }) =>
    about?.name === undefined ? notation : `${notation} ${about.name.label}`;
  const using = (version) =>
    (uses[version.iri] ?? []).filter((pod) => pods.includes(pod));
  return html`<h1>${series.label}</h1>
<p class="lead">Using ${versionName(series.current)}</p>
${published(series, now)}
${searchBox(search, text)}
${codesFound({
  searched,
  page,
  pageHref,
  heads: ["Code", "Name", "Status", ...(maps ? ["Maps to"] : [])],
  row: ({ notation, about, mapsTo }) =>
    html`<td>${codeHref === undefined ? notation : html`<a href=${codeHref(notation)}>${notation}</a>`}</td><td>${namesOf(about)}</td><td>${statusOf(about)}</td>${
      maps && html`<td>${mapsTo.map(named).join(", ")}</td>`
    }`,
})}
<div class="card versions"><h2>Which pods use which version</h2><ul>
${series.versions.map((version) => {
  const pods = using(version);
  return html`<li><strong>${versionName(version)}</strong>${version.iri === series.current.iri && html` <span class="tag">current</span>`}: ${
    pods.length === 0
      ? html`<span class="muted">no pod</span>`
      : pods.map(
          (pod, index) =>
            html`${index > 0 && ", "}<a href=${href(pod)}>${personName(pod, titles)}</a>`,
        )
  }</li>`;
})}
</ul></div>`;
}

/**
 * A source's page: `source` as `sourcesOf` gives it, who publishes it, its licence and how fresh it is at `now`, a card
 * for each set of its tables these differ for, headed with their labels when there are several; a search box
 * sending `q` to `search`, with `text` in it, over the codes of all its tables; the codes `searched` found, page `page`
 * of them, each a link to `codeHref(notation)`, with links to the pages around it at `pageHref(page)`; and what the
 * source publishes, each table a link to `tableHref(series)`.
 */
export function sourcePage({
  source,
  searched,
  text,
  search,
  page = 1,
  pageHref,
  codeHref,
  tableHref,
  now,
}) {
  const alike = new Map();
  for (const series of source.series) {
    const said = JSON.stringify([
      series.publisher,
      series.credit,
      series.licence,
      freshness(series, now),
    ]);
    alike.set(said, [...(alike.get(said) ?? []), series]);
  }
  const cards = [...alike.values()];
  return html`<h1>${source.label}</h1>
${cards.map((series) =>
  published(
    series[0],
    now,
    cards.length > 1 && series.map(({ label }) => label).join(", "),
  ),
)}
${searchBox(search, text)}
${codesFound({
  searched,
  page,
  pageHref,
  heads: ["Code", "Name", "Status"],
  row: ({ notation, about }) =>
    html`<td><a href=${codeHref(notation)}>${notation}</a></td><td>${namesOf(about)}</td><td>${statusOf(about)}</td>`,
})}
<div class="card versions"><h2>What this source publishes</h2><ul>
${source.series.map(
  (series) =>
    html`<li><a href=${tableHref(series)}>${series.label}</a>: ${versionName(series.current)}</li>`,
)}
</ul></div>`;
}

/**
 * A code's page: everything `facts` (`facts()`'s answer) says of it, a variation's classification as the ClinVar sentence, each fact naming the table among `held` (as
 * `held()` gives them) and the version it came from, each code a link to `codeHref(notation)`; and a link back to
 * `source` at `back`.
 */
export function codePage({ source, held, facts, codeHref, back }) {
  const tableOf = (series) => held.find(({ iri }) => iri === series);
  const from = ({ series, version }) => {
    const table = tableOf(series);
    const held = table?.versions.find(({ iri }) => iri === version);
    return html`<p class="muted">From ${table?.label ?? series}, ${held === undefined ? version : versionName(held)}.</p>`;
  };
  const code = ({ notation, about }) =>
    html`<a href=${codeHref(notation)}>${notation}</a>${about?.name !== undefined && ` ${about.name.label}`}`;
  const codes = ({ total, codes: shown }) =>
    html`${shown.map((each, index) => html`${index > 0 && ", "}${code(each)}`)}${
      total > shown.length &&
      ` and ${(total - shown.length).toLocaleString("en")} more`
    }`;
  const {
    notation,
    about,
    names,
    status,
    mappings,
    classifications = [],
    panels = [],
    classes = [],
    page,
  } = facts;
  const placed = (each) =>
    html`<li>${code(each)}${each.required !== undefined && html` <span class="muted">${REQUIRED[each.required] ?? each.required}</span>`}</li>`;
  const credit = (series) =>
    tableOf(series)?.credit !== undefined &&
    html`<p class="muted">${tableOf(series).credit}</p>`;
  return html`<p><a href=${back}>${source.label}</a></p>
<h1>${notation}${about?.name !== undefined && ` ${about.name.label}`}</h1>
${page !== undefined && html`<p><a href=${page.href} rel="external">${page.system}'s page for ${notation}</a></p>`}
${names.map(
  (name) => html`<div class="card"><h2>Names</h2>
<p><strong>${name.label}</strong></p>
${name.altLabels.length > 0 && html`<ul>${name.altLabels.map((label) => html`<li>${label}</li>`)}</ul>`}
${from(name)}</div>`,
)}
${status.map(
  (said) => html`<div class="card"><h2>Status</h2>
<p>${said.deprecated ? "Retired" : "In use"}${said.replacedBy.length > 0 && html`, replaced by ${said.replacedBy.map((each, index) => html`${index > 0 && ", "}${code(each)}`)}`}.</p>
${from(said)}</div>`,
)}
${mappings.map((mapping) => {
  const table = tableOf(mapping.series);
  return html`<div class="card"><h2>${table?.label ?? mapping.series}</h2>
${mapping.mapsTo.map(
  (target) =>
    html`<p>Maps to ${code(target)}${target.alongside.total > 0 && html`, as do ${codes(target.alongside)}`}.</p>`,
)}
${mapping.mappedFrom.total > 0 && html`<p>Mapped to it: ${codes(mapping.mappedFrom)}.</p>`}
${from(mapping)}</div>`;
})}
${classifications.map(
  (
    row,
  ) => html`<div class="card"><h2>${tableOf(row.series)?.label ?? row.series}</h2>
<p>${rowSaid(row)}</p>
${credit(row.series)}
${from(row)}</div>`,
)}
${panels.map(
  (
    panel,
  ) => html`<div class="card"><h2>${tableOf(panel.series)?.label ?? panel.series}</h2>
${
  panel.members.length > 0 &&
  html`<p>A panel of ${panel.members.length === 1 ? "one member" : `${panel.members.length} members`}, in order:</p>
<ol class="members">${panel.members.map(placed)}</ol>`
}
${
  panel.heldBy.total > 0 &&
  html`<p>${panel.members.length > 0 ? "Itself a member" : "A member"} of ${panel.heldBy.total === 1 ? "one panel" : `${panel.heldBy.total.toLocaleString("en")} panels`}:</p>
<ul class="members">${panel.heldBy.panels.map(placed)}</ul>
${panel.heldBy.total > panel.heldBy.panels.length && html`<p class="muted">and ${(panel.heldBy.total - panel.heldBy.panels.length).toLocaleString("en")} more.</p>`}`
}
${credit(panel.series)}
${from(panel)}</div>`,
)}
${classes.map(
  (
    classed,
  ) => html`<div class="card"><h2>${tableOf(classed.series)?.label ?? classed.series}</h2>
${
  classed.in.length > 0 &&
  html`<ul class="members">${classed.in.map(
    (each) =>
      html`<li><strong>${relationName(each.relation)}:</strong> ${code(each.class)}${each.through !== undefined && html` <span class="muted">through ${code(each.through)}</span>`}</li>`,
  )}</ul>`
}
${(classed.withheld ?? []).map(
  (each) =>
    html`<p>No ${relationName(each.relation).toLowerCase()} is given: FDA classes a different form of ${code(each.ingredient)}; RxNorm does not tie this drug to it.</p>`,
)}
${credit(classed.series)}
${from(classed)}</div>`,
)}
${names.length + status.length + mappings.length + classifications.length + panels.length + classes.length === 0 && html`<p class="muted">No table this app holds says anything of this code.</p>`}`;
}

/**
 * The page of a pod's medicines by class: `rows` is `pod.medicationClasses()`'s answer, `medications` the rows of
 * `pod/My active medications`, `about` is `classesSaid`'s answer, none until the tables can say, `elsewhere` is
 * `classedElsewhere`'s, and `held` the tables' `held()`. A class is a button of the picker, a link to `classHref(code)`
 * (or to `allHref` for all of them); `picked` is the class shown, by its code, or none for every class. Each medicine
 * is a link to `entryHref(entry)`, and each class a link to `codeHref(series, notation)` when `held` holds the series
 * that names it. A row `stated` is on a code the entry states, so is not "through" anything. The page says which
 * medicines it does not class, and why.
 */
export function classesPage({
  pod,
  titles,
  back,
  rows,
  medications = [],
  about = new Map(),
  elsewhere = new Map(),
  held = [],
  picked,
  classHref,
  allHref,
  entryHref,
  codeHref,
}) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.relation} ${row.class}`;
    if (!groups.has(key))
      groups.set(key, {
        relation: row.relation,
        class: row.class,
        medicines: new Map(),
        origins: new Set(),
      });
    const group = groups.get(key);
    if (!group.medicines.has(row.entry))
      group.medicines.set(row.entry, {
        entry: row.entry,
        name: row.medication,
        through: new Set(),
      });
    if (row.stated !== "true")
      group.medicines.get(row.entry).through.add(row.through);
    group.origins.add(row.origin);
  }
  const nameOf = (code) =>
    about.get(code)?.name?.label ??
    about.get(code)?.notation ??
    notationOf(code);
  const classed = [...groups.values()].sort(
    (a, b) =>
      RELATIONS.findIndex(([each]) => each === a.relation) -
        RELATIONS.findIndex(([each]) => each === b.relation) ||
      nameOf(a.class).localeCompare(nameOf(b.class)),
  );
  const shown = classed.filter(
    (group) => picked === undefined || group.class === picked,
  );
  const inAClass = new Set(rows.map((row) => row.entry));
  const left = medications.filter(({ entry }) => !inAClass.has(entry));
  const formOf = left.filter(({ code }) => elsewhere.has(code));
  const unclassed = left.filter(({ code }) => !elsewhere.has(code));
  const from = (group) => {
    const versions = [...group.origins].flatMap((origin) => {
      const found = heldAt(origin, held);
      return found === undefined ? [] : [found];
    });
    return versions.length === 0
      ? undefined
      : html`<p class="muted">From ${listed(versions.map(({ series, version }) => `${series.label}, ${versionName(version)}`))}.</p>`;
  };
  const link = (group) => {
    const series = about.get(group.class)?.name?.origin;
    const found = series === undefined ? undefined : heldAt(series, held);
    return found === undefined || codeHref === undefined
      ? nameOf(group.class)
      : html`<a href=${codeHref(found.series, about.get(group.class).notation)}>${nameOf(group.class)}</a>`;
  };
  const credits = [
    ...new Set(
      classed.flatMap((group) =>
        [...group.origins].flatMap(
          (origin) => heldAt(origin, held)?.series.credit ?? [],
        ),
      ),
    ),
  ];
  return html`<p><a href=${back}>Back to ${personName(pod, titles)}</a></p>
<h1>Medicines by class</h1>
<p class="lead">${classed.length === 0 ? "None of this pod's active medicines is in a class the app's tables know." : "Which of the active medicines of this pod are in a class, by the classes MED-RT gives the drug."}</p>
${
  classed.length > 0 &&
  html`<div class="card picker"><h2>Pick a class</h2><ul>
<li><a href=${allHref} aria-current=${picked === undefined ? "true" : undefined}>All classes</a></li>
${classed.map(
  (group) =>
    html`<li><a href=${classHref(group.class)} aria-current=${picked === group.class ? "true" : undefined}>${nameOf(group.class)}</a></li>`,
)}
</ul></div>`
}
${shown.map(
  (group) => html`<div class="card"><h2>${link(group)}</h2>
<p class="muted">${relationName(group.relation)}</p>
<ul>${[...group.medicines.values()].map(
    (medicine) =>
      html`<li>${entryHref === undefined ? medicine.name : html`<a href=${entryHref(medicine.entry)}>${medicine.name}</a>`}${medicine.through.size > 0 && html` <span class="muted">through ${listed([...medicine.through].map(nameOf))}</span>`}</li>`,
  )}</ul>
${from(group)}</div>`,
)}
${picked !== undefined && shown.length === 0 && html`<p>None of this pod's active medicines is in that class.</p>`}
${credits.map((credit) => html`<p class="muted">${credit}</p>`)}
${
  left.length > 0 &&
  html`<div class="card"><h2>Not in a class here</h2>
${formOf.map(
  ({ medication, code }) =>
    html`<p>${medication}: FDA classes a different form of ${listed(elsewhere.get(code))}; RxNorm does not tie this product to it.</p>`,
)}
${
  unclassed.length > 0 &&
  html`<p>${listed(unclassed.map(({ medication }) => medication))}. MED-RT classes single ingredients, not the combination of several, and gives some single ingredients no class; a drug the tables do not map to an ingredient has no class here.</p>`
}</div>`
}`;
}

/**
 * The page of a pod's results in the LOINC `panel` a person picked: `rows` is `pod.panelResults(panel)`'s answer, `labs`
 * the rows of `pod/My lab results`, `about` is `panelSaid`'s answer, none until the tables can say, and `held` the
 * tables' `held()`. Each test the panel lists is in LOINC's order with whether it is required and the pod's results of
 * it, newest first, each a link to `entryHref(entry)`; a test of a panel nested in it is under that panel. The page says
 * which required tests the pod has no result for, and which version of the tables says so. It never says a result was
 * drawn as part of the panel: only that LOINC lists the test in it.
 */
export function panelPage({
  pod,
  titles,
  back,
  panel,
  rows,
  labs = [],
  about = new Map(),
  held = [],
  entryHref,
  codeHref,
}) {
  const nameOf = (code) =>
    about.get(code)?.name?.label ??
    about.get(code)?.notation ??
    notationOf(code);
  const results = new Map(labs.map((row) => [row.entry, row]));
  const lines = new Map();
  for (const row of rows) {
    const key = `${row.via} ${row.member}`;
    if (!lines.has(key))
      lines.set(key, {
        member: row.member,
        via: row.via,
        sequence: Number(row.sequence),
        required: row.required,
        results: [],
      });
    if (row.entry !== undefined)
      lines
        .get(key)
        .results.push(results.get(row.entry) ?? { entry: row.entry });
  }
  const byPlace = (a, b) =>
    a.sequence - b.sequence || nameOf(a.member).localeCompare(nameOf(b.member));
  const own = [...lines.values()].filter((line) => line.via === panel);
  const shownOwn = new Set(own.map((line) => line.member));
  const nested = new Map();
  for (const line of lines.values())
    if (line.via !== panel && !shownOwn.has(line.member))
      nested.set(line.via, [...(nested.get(line.via) ?? []), line]);
  const groups = [
    { via: panel, lines: own.sort(byPlace) },
    ...[...nested]
      .sort(([a], [b]) => nameOf(a).localeCompare(nameOf(b)))
      .map(([via, each]) => ({ via, lines: each.sort(byPlace) })),
  ].filter((group) => group.lines.length > 0);
  // The query's own answer: its missing rows are exact, and a held result is required in the panel when its row is one
  // the panel lists itself and says R, or when a missing test sits in the same nested panel (the query puts one there
  // only when every nesting row on the way says R). A held member of any other nested panel is not counted: its own
  // row says nothing of its parent's requirement.
  const missing = [
    ...new Map(
      [...lines.values()]
        .filter((line) => line.results.length === 0 && line.required === "R")
        .map((line) => [line.member, line]),
    ).values(),
  ];
  const requiredVias = new Set([panel, ...missing.map((line) => line.via)]);
  const required = [
    ...new Map(
      [...lines.values()]
        .filter(
          (line) =>
            line.required === "R" &&
            (line.results.length === 0 || requiredVias.has(line.via)),
        )
        .map((line) => [line.member, line]),
    ).values(),
  ];
  const title = nameOf(panel);
  const said =
    rows.length === 0
      ? "You have no results in this panel."
      : required.length === 0
        ? "LOINC requires none of this panel's tests."
        : missing.length === 0
          ? `You have ${required.length === 1 ? "the one required test" : `all ${required.length} required tests`}.`
          : `You have ${required.length - missing.length} of ${required.length} required test${required.length === 1 ? "" : "s"}; missing: ${listed(missing.map((line) => nameOf(line.member)))}.`;
  const requirement = (line) =>
    line.required === undefined
      ? undefined
      : (REQUIRED[line.required] ?? line.required);
  const listing = (group) =>
    html`<ol class="members">${group.lines.map(
      (line) =>
        html`<li><strong>${nameOf(line.member)}</strong>${requirement(line) !== undefined && html` <span class="muted">${requirement(line)}</span>`}${
          line.results.length === 0
            ? html` <span class="tag warm">No result</span>`
            : html`<ul>${line.results
                .sort((a, b) =>
                  compare("date", b.performed ?? "", a.performed ?? ""),
                )
                .map((result) => {
                  const value =
                    [result.value, result.unit].filter(Boolean).join(" ") ||
                    "Result";
                  return html`<li>${entryHref === undefined ? value : html`<a href=${entryHref(result.entry)}>${value}</a>`}${result.performed !== undefined && html` <span class="muted">${day(result.performed)}</span>`}</li>`;
                })}</ul>`
        }</li>`,
    )}</ol>`;
  const versions = [
    ...new Set(
      [
        ...rows.map((row) => row.origin),
        ...[...about.values()].map((said) => said?.name?.origin),
      ].filter(Boolean),
    ),
  ].flatMap((origin) => heldAt(origin, held) ?? []);
  const naming = about.get(panel)?.name?.origin;
  const named = naming === undefined ? undefined : heldAt(naming, held);
  return html`<p><a href=${back}>Back to ${personName(pod, titles)}</a></p>
<h1>Your results in ${title}</h1>
<p class="lead">${said}</p>
${
  rows.length > 0 &&
  html`<p class="muted">${
    named !== undefined && codeHref !== undefined
      ? html`LOINC <a href=${codeHref(named.series, about.get(panel).notation)}>${about.get(panel).notation}</a> lists`
      : "LOINC lists"
  } these tests in this panel; that does not say your results were drawn as part of it.</p>`
}
${groups.map(
  (group) =>
    html`<div class="card"><h2>${group.via === panel ? "Tests in the panel's order" : `Within ${nameOf(group.via)}`}</h2>${listing(group)}</div>`,
)}
${versions.length > 0 && html`<p class="muted from">From ${listed(versions.map(({ series, version }) => `${series.label}, ${versionName(version)}`))}.</p>`}
${[...new Set(versions.flatMap(({ series }) => series.credit ?? []))].map((credit) => html`<p class="muted">${credit}</p>`)}`;
}

/** The page of reference tables when the app holds none. */
export function noTables() {
  return html`<h1>No reference tables yet</h1>
<p class="lead">Reference tables name codes and join records that say the same thing differently. This app keeps the ones its feeds publish; Check now reads them.</p>`;
}

/**
 * The form that sets the world's date: a day to pick and a Set button, and beside it a Today button that sends an
 * empty date. Both post to `action`, the day field `date`.
 */
function worldDateForms({ asOf, action }) {
  return html`<form method="post" action=${action} class="inline" data-doing="Setting the date…">
<label>Date <input type="date" name="date" value=${asOf === undefined ? undefined : new Date(Date.parse(asOf)).toISOString().slice(0, 10)} required /></label>
<button>Set</button>
</form>
${postButton(action, { date: "" }, "Today", "quiet", "Setting the date…")}`;
}

/**
 * The line where a sign-in begins about the world's date: what the hospitals answer as of, `asOf`, and a way to change
 * it, `href` a link to the page that does, else `action` where the line opens the forms in place.
 */
function worldDateLine({ asOf, href, action }) {
  return html`<div class="world-date">
<p class="muted">${worldDateSaid(asOf)}${href !== undefined && html` <a href=${href}>Change the world's date</a>`}</p>
${
  href === undefined &&
  html`<details>
<summary>Change the world's date</summary>
${worldDateForms({ asOf, action })}
</details>`
}
</div>`;
}

/**
 * The page where the world's date is changed, on a host that has pages: the date the hospitals answer as of, `asOf`
 * (an instant, or undefined for everything they hold), the forms that post to `action`, `problem` when the last date
 * given was no date, and a link `back`.
 */
export function worldDatePage({ asOf, action, problem, back }) {
  return html`<h1>The world's date</h1>
<p class="lead">${worldDateSaid(asOf)}</p>
${problem !== undefined && html`<p class="note" role="alert">${problem}</p>`}
<div class="card world-date">
<p>Pick a day: the hospitals then show their records as they stood at the end of it. Today puts the date back to now, with everything they hold.</p>
${worldDateForms({ asOf, action })}
</div>
${back !== undefined && html`<p><a href=${back}>Back</a></p>`}`;
}

/**
 * A connection to the hospital named `hospital`, for the pod `pod`, as a box over the pod's page with the id `id`,
 * which closes to `back`. While `connection.step` is `signing in` or `pulling`, its steps; else `failed` when given, the
 * developer's detail of why, with a Try again button when `retry`. When `failure` (a `ConnectionFailure`'s kind) is
 * given too, the box leads with a sentence for the person naming the hospital and what to do, and, when signing in again
 * can help, a button from `signInAgain(label)`; `failureOverrides` replaces a kind's row for a surface. It keeps `failed` in a smaller line. Else its steps, whose record `about` is when not the pod's
 * person, what each of `sources` (from `look`) holds, what `pulled` left out, and a button that posts to `bring`.
 * With `pulledAsOf`, the instant the pull was made under (undefined: no date), the box says what the pull answered as of.
 */
export function connectionDialog({
  id,
  pod,
  titles,
  hospital,
  back,
  connection,
  failed,
  failure,
  failureOverrides,
  signInAgain,
  retry,
  sources = [],
  pulled,
  about,
  aboutNames,
  bring,
  pulledAsOf,
}) {
  const who = personName(pod, titles);
  const typed = typedName(pod, titles);
  const grade =
    typed === undefined ? undefined : gradePerson(typed, aboutNames ?? []);
  const name = hospitalName(hospital);
  const said = (body) => box(id, name, body, { back });
  if (connection.step === "bringing in")
    return said(
      html`<div class="card"><${Steps} connection=${connection} /></div>`,
    );
  if (connection.step === "signing in" || connection.step === "pulling")
    return said(
      html`<div class="card"><${Steps} connection=${connection} /><p class="muted">This refreshes itself until the record is here.</p></div>`,
    );
  if (failed !== undefined) {
    const person =
      failure === undefined
        ? undefined
        : failureSaid(failure, name, failureOverrides);
    return said(
      html`<div class="card">${
        person === undefined
          ? html`<p>${failed}</p>`
          : html`<p role="alert">${person.said}</p>${person.again && signInAgain?.(`Sign in again at ${name}`)}<p class="muted detail">${failed}</p>`
      }${retry && postButton(bring, {}, "Try again", undefined, BRINGING)}</div>`,
    );
  }
  const has = sources.map(
    (source) =>
      html`<p><strong>What ${name} has:</strong> ${counted(source.records) || "nothing"}.</p>
<p class="muted">${who}'s pod ${source.claimed ? "already has records from here" : "has nothing from here yet"}.</p>`,
  );
  const denied = pulled.denied.map(({ type, category }) =>
    category === undefined ? type : `${type} (${category})`,
  );
  return said(html`<div class="card"><${Steps} connection=${connection} /></div>
${
  about !== undefined &&
  (grade === undefined
    ? slug(about) !== pod &&
      html`<p class="note">This record is ${about}'s. Bringing it in makes this ${about}'s pod.</p>`
    : grade === "possible"
      ? html`<p class="muted">This record is ${about}'s.</p>`
      : grade === "certainly-not" &&
        html`<p class="note warm" role="alert">This record is ${about}'s, not ${who}'s.</p>`)
}
<div class="card">
${has}
${pulled.missing.length > 0 && html`<p class="muted">Mentioned, but not sent: ${pulled.missing.join(", ")}</p>`}
${denied.length > 0 && html`<p class="muted">Not allowed to read: ${denied.join(", ")}</p>`}
${pulledAsOfSaid(pulledAsOf) !== undefined && html`<p class="muted">${pulledAsOfSaid(pulledAsOf)}</p>`}
${postButton(bring, {}, grade === "certainly-not" ? `Bring ${about}'s records into ${who}'s pod anyway` : grade === "possible" ? `Bring ${about}'s records into ${who}'s pod` : `Bring it into ${who}'s pod`, grade === "certainly-not" ? "quiet" : undefined, BRINGING)}
</div>`);
}

export const STYLE = `
:root {
  --page: #f6f7f8; --panel: #ffffff; --text: #1f2933; --muted: #5f6b76;
  --line: #e1e5e8; --soft: #eef1f3; --accent: #2b6a8e; --on-accent: #ffffff;
  --tint: #eaf3f8; --bar: #243b4a; --on-bar: #f3f5f6;
  --warm: #b0432f; --warm-bg: #fbeae6;
}
@media (prefers-color-scheme: dark) {
  :root {
    --page: #1a1d20; --panel: #23272b; --text: #e6e9ec; --muted: #9aa5ae;
    --line: #353b41; --soft: #2c3237; --accent: #8fc1dc; --on-accent: #14202a;
    --tint: #243239; --bar: #101417; --on-bar: #e6e9ec;
    --warm: #f0a08f; --warm-bg: #3c2622;
  }
}
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.55 system-ui, sans-serif; background: var(--page); color: var(--text); }
header.bar { display: flex; align-items: center; gap: 1rem; padding: 0.6rem 1.25rem; background: var(--bar); color: var(--on-bar); }
header.bar > a { color: var(--on-bar); text-decoration: none; font-weight: 600; letter-spacing: 0.02em; }
header.bar .demo { margin-left: auto; font-size: 0.8rem; opacity: 0.75; }
.menu { position: relative; font-size: 0.9rem; }
.menu summary { list-style: none; cursor: pointer; padding: 0.1rem 0.5rem; border-radius: 5px; }
.menu summary::-webkit-details-marker { display: none; }
.menu summary:hover, .menu[open] summary { background: rgb(255 255 255 / 0.14); }
.menu ul { position: absolute; top: calc(100% + 0.35rem); left: 0; z-index: 10; min-width: 11rem; list-style: none; margin: 0; padding: 0.3rem; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.25); }
.menu li a { display: block; padding: 0.4rem 0.7rem; border-radius: 5px; color: var(--text); text-decoration: none; white-space: nowrap; }
.menu li a:hover, .menu li a:focus { background: var(--soft); }
@media (max-width: 46rem) {
  header.bar { gap: 0.5rem; padding: 0.6rem 1rem; }
  header.bar .demo { font-size: 0.72rem; text-align: right; }
}
.layout { display: grid; grid-template-columns: 15rem 1fr; min-height: calc(100vh - 2.7rem); }
aside { background: var(--panel); border-right: 1px solid var(--line); padding: 1.25rem 1rem; }
main { padding: 1.75rem 2.25rem 3rem; max-width: 62rem; min-width: 0; }
@media (max-width: 46rem) {
  .layout { grid-template-columns: 1fr; min-height: 0; }
  aside { border-right: 0; border-bottom: 1px solid var(--line); }
  main { padding: 1.25rem; }
}
aside h2 { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 0.5rem 0.6rem; }
nav ul, .tables ul { list-style: none; padding: 0; margin: 0 0 1rem; }
nav a, .tables li a { display: block; padding: 0.4rem 0.6rem; border-radius: 6px; color: var(--text); text-decoration: none; }
nav a:hover, .tables li a:hover { background: var(--soft); }
nav a[aria-current], .tables li a[aria-current] { background: var(--tint); color: var(--accent); font-weight: 600; }
.tables { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid var(--line); }
.tables p { margin: 0 0 0.75rem 0.6rem; }
.tables form { display: block; }
.tables button { width: 100%; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1.25rem; margin: 0; }
.facts dt { color: var(--muted); font-size: 0.9rem; }
.facts dd { margin: 0; }
.versions ul { margin: 0; padding-left: 1.2rem; }
.versions li { margin: 0.3rem 0; }
.pages { display: flex; gap: 1rem; margin: 0.6rem 0 1.25rem; }
h1 { font-size: 1.75rem; margin: 0 0 0.2rem; }
h2 { font-size: 1.05rem; margin: 0 0 0.6rem; }
a { color: var(--accent); }
.muted { color: var(--muted); font-size: 0.9rem; }
.lead { color: var(--muted); margin: 0 0 0.6rem; }
.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 1.5rem; padding: 0; list-style: none; }
.chips li { font-size: 0.82rem; padding: 0.15rem 0.6rem; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); color: var(--muted); }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 1.1rem 1.25rem; margin: 0 0 1.25rem; }
.worth { background: var(--tint); border-color: transparent; }
.worth ul { margin: 0; padding-left: 1.2rem; }
.worth li { margin: 0.3rem 0; }
.worth a { color: var(--text); }
.worth a:hover { color: var(--accent); }
.changes .change { padding: 0.9rem 0; border-top: 1px solid var(--line); }
.changes h2 + .change { border-top: 0; padding-top: 0; }
.changes p { margin: 0.25rem 0; }
.changes .said { font-weight: 600; }
.changes .how { padding: 0.9rem 0; border-top: 1px solid var(--line); }
.changes .how h3 { font-size: 0.95rem; margin: 0 0 0.3rem; }
.changes .how ol { margin: 0.25rem 0; padding-left: 1.4rem; }
.chart { display: block; max-width: 100%; height: auto; }
.chart.small { width: 15rem; margin: 0.4rem 0; }
.chart.large, .chart.lane { width: 100%; }
.chart .grid { stroke: var(--line); stroke-width: 1; }
.chart .tick, .chart .lane-label { fill: var(--muted); font-size: 11px; font-family: inherit; }
.chart .series { stroke: var(--accent); stroke-width: 2; }
.chart .marker { fill: var(--accent); stroke: var(--panel); stroke-width: 1; }
.chart .mark { stroke: var(--text); stroke-width: 1.5; stroke-dasharray: 5 4; }
.chart .bar { fill: var(--muted); opacity: 0.55; }
.chart .bar.chosen { fill: var(--accent); opacity: 1; }
.chart .lane-label.chosen { fill: var(--text); font-weight: 600; }
.picker h3 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0.6rem 0 0.3rem; }
.picker ul { list-style: none; margin: 0 0 0.6rem; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
.picker a { display: inline-block; padding: 0.15rem 0.7rem; border: 1px solid var(--line); border-radius: 999px; text-decoration: none; }
.picker a[aria-current] { background: var(--tint); border-color: var(--accent); font-weight: 600; }
.entry ul { margin: 0; padding-left: 1.2rem; }
.entry li { margin: 0.3rem 0; }
.entry .from { display: block; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr)); gap: 1rem; margin: 0 0 1.25rem; }
.tile { display: block; padding: 1rem 1.1rem; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; color: var(--text); text-decoration: none; }
.tile:hover { border-color: var(--accent); background: var(--tint); }
.tile-box { display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.tile-box:hover { border-color: var(--accent); }
.tile-box .tile { flex: 1; border: 0; border-radius: 0; }
.tile-box .by { display: block; padding: 0.55rem 1.1rem; border-top: 1px solid var(--line); font-weight: 600; text-decoration: none; }
.tile-box .by:hover { background: var(--tint); }
.tile .kind { display: block; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.tile .count { display: block; font-size: 2rem; font-weight: 600; line-height: 1.2; color: var(--accent); }
.tile .peek { display: block; font-size: 0.88rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.2rem; }
.filter { width: 100%; margin: 0.25rem 0 0.75rem; }
.scroll { max-height: 60vh; overflow: auto; padding-right: 0.75rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.95rem; }
th, td { text-align: left; vertical-align: baseline; padding: 0.45rem 0.6rem; border-top: 1px solid var(--line); }
th { border-top: 0; position: sticky; top: 0; background: var(--panel); }
th button { all: unset; cursor: pointer; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); white-space: nowrap; }
th button:hover, th[aria-sort] button { color: var(--accent); }
th[aria-sort="ascending"] button::after { content: " ↑"; }
th[aria-sort="descending"] button::after { content: " ↓"; }
td:first-child { font-weight: 500; }
tr[hidden] { display: none; }
.tag { display: inline-block; font-size: 0.74rem; padding: 0.05rem 0.5rem; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; }
.tag.warm { border-color: transparent; background: var(--warm-bg); color: var(--warm); font-weight: 600; }
.button, button { display: inline-block; font: inherit; padding: 0.45rem 1rem; border-radius: 7px; border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); cursor: pointer; text-decoration: none; }
.button.quiet, button.quiet { background: transparent; color: var(--accent); }
button.warm { background: var(--warm); border-color: var(--warm); color: var(--panel); }
.button.wide { display: block; text-align: center; }
input { font: inherit; padding: 0.45rem 0.65rem; border: 1px solid var(--line); border-radius: 7px; background: var(--page); color: var(--text); }
form.inline { display: inline; }
.world-date summary { cursor: pointer; color: var(--accent); }
.world-date details { margin: 0 0 0.75rem; }
.world-date form { margin: 0.4rem 0.4rem 0 0; }
.row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.row input { flex: 1; min-width: 10rem; }
.encrypt { margin: 0.75rem 0; }
.encrypt .muted { display: block; margin-left: 1.6rem; }
.words { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; list-style: none; padding: 0; margin: 1rem 0; counter-reset: word; }
.words li { counter-increment: word; background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 0.8rem 1rem; font-size: 1.35rem; font-weight: 600; }
.words li::before { content: counter(word); color: var(--muted); font-size: 0.8rem; font-weight: 400; margin-right: 0.6rem; }
.stack { display: flex; flex-direction: column; gap: 0.6rem; max-width: 24rem; }
.stack label { display: flex; flex-direction: column; gap: 0.25rem; }
.row h2 { flex: 1; margin: 0; }
.steps { list-style: none; padding: 0; margin: 0; }
.steps li { padding: 0.15rem 0; color: var(--muted); }
.steps li::before { content: "○  "; }
.steps li.done { color: var(--text); }
.steps li.done::before { content: "✓  "; color: var(--accent); }
.steps li.now { color: var(--text); font-weight: 600; }
.steps li.now::before { content: "…  "; }
.note { border-left: 3px solid var(--accent); padding: 0.5rem 0.9rem; background: var(--tint); border-radius: 0 7px 7px 0; margin: 0 0 1.25rem; }
.note.warm { border-left-color: var(--warm); background: var(--warm-bg); color: var(--warm); }
.detail { font-size: 0.85rem; }
.dialog { display: none; position: fixed; inset: 0; z-index: 20; background: rgb(0 0 0 / 0.45); padding: 1rem; overflow: auto; }
.dialog:target { display: grid; place-items: center; }
.dialog .backdrop { position: fixed; inset: 0; }
.dialog .box { position: relative; background: var(--panel); border-radius: 12px; padding: 1.5rem 1.75rem; max-width: 34rem; width: 100%; box-shadow: 0 10px 40px rgb(0 0 0 / 0.3); }
.dialog .box.wide { max-width: 44rem; }
.dialog .close { float: right; text-decoration: none; color: var(--muted); font-size: 1.4rem; line-height: 1; }
.people { list-style: none; padding: 0; margin: 0.5rem 0 1.25rem; }
.people li { margin: 0.35rem 0; }
.people form { display: block; }
.people button, .people .button { display: block; width: 100%; text-align: left; background: var(--soft); color: var(--text); border-color: var(--line); }
.people button:hover, .people .button:hover { border-color: var(--accent); background: var(--tint); }
.people .muted { display: block; font-size: 0.8rem; }
.doing { position: fixed; top: 0.5rem; left: 50%; transform: translateX(-50%); z-index: 30; display: flex; align-items: center; gap: 0.6rem; margin: 0; padding: 0.4rem 1rem; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); box-shadow: 0 4px 16px rgb(0 0 0 / 0.2); }
.doing[hidden] { display: none; }
.pending { position: relative; animation: arrive 0.15s 0.3s backwards; }
.pending [role="status"] { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.pending span { display: block; height: 0.9rem; margin-block: calc((var(--pitch, 1.4rem) - 0.9rem) / 2); border-radius: 0.25rem; background: linear-gradient(90deg, var(--line) 35%, var(--soft) 50%, var(--line) 65%) 0 0 / 300% 100%; animation: shimmer 1.6s linear infinite; }
.pending span:last-child { width: 60%; }
.arrive { animation: arrive 0.15s; }
@keyframes arrive { from { opacity: 0; } }
@keyframes shimmer { to { background-position-x: -200%; } }
@media (prefers-reduced-motion: reduce) { .pending { animation-duration: 0.01s; } .pending span, .arrive { animation: none; } }
.spinner { width: 1rem; height: 1rem; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
body[data-state="busy"] { cursor: progress; }
`;

/** The chat strip's styles, from `STYLE`'s colours so dark mode follows; a page that has a strip gets them after `STYLE`. */
export const CHAT_STYLE = `
.chat { position: sticky; bottom: 0; z-index: 8; display: flex; flex-direction: column; max-height: max(33vh, 15rem); background: var(--panel); border-top: 1px solid var(--line); padding: 0.6rem 1.25rem; box-shadow: 0 -4px 16px rgb(0 0 0 / 0.08); }
.chat [hidden] { display: none; }
.chat-off { margin: 0; color: var(--muted); font-size: 0.9rem; }
.chat-bar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin: 0 0 0.4rem; }
.chat > * { flex: none; }
.chat > .chat-log, .chat > .chat-chips { flex: 0 1 auto; min-height: 0; overflow: auto; }
.chat > .chat-log { min-height: 4rem; }
.chat-about { margin: 0 0 0.4rem; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
@media (max-width: 46rem) {
  .chat-bar { gap: 0.25rem 0.75rem; }
  .chat-about { -webkit-line-clamp: 1; line-clamp: 1; }
}
.chat[data-folded="true"] > :not(.chat-bar) { display: none; }
.chat[data-folded="true"] .chat-bar { margin: 0; }
.chat-bar .chat-new { margin-left: auto; }
.chat-bar .chat-new, .chat-bar .chat-fold { padding: 0.15rem 0.7rem; }
.chat-recent { position: relative; font-size: 0.9rem; }
.chat-recent summary { cursor: pointer; color: var(--accent); }
.chat-recent ul { position: absolute; bottom: calc(100% + 0.35rem); left: 0; z-index: 10; min-width: 16rem; max-height: 14rem; overflow: auto; list-style: none; margin: 0; padding: 0.3rem; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.25); }
.chat-recent li button { display: block; width: 100%; text-align: left; background: transparent; color: var(--text); border-color: transparent; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-recent li button:hover { background: var(--soft); }
.chat-recent li.empty { padding: 0.3rem 0.6rem; color: var(--muted); }
.chat-log { margin: 0 0 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
.chat-log .you { align-self: flex-end; max-width: 80%; background: var(--tint); border-radius: 10px; padding: 0.3rem 0.8rem; white-space: pre-wrap; }
.chat-log .model { white-space: pre-wrap; }
.chat-log .stopped { color: var(--muted); font-size: 0.9rem; }
.chat-log .refused { border-left: 3px solid var(--accent); background: var(--soft); padding: 0.4rem 0.8rem; border-radius: 0 7px 7px 0; }
.chat-log .failed { border-left: 3px solid var(--warm); background: var(--warm-bg); color: var(--warm); padding: 0.4rem 0.8rem; border-radius: 0 7px 7px 0; }
.chat-log .card { margin: 0; padding: 0.7rem 0.9rem; background: var(--page); }
.chat-log .card p { margin: 0.15rem 0; }
.chat-log .card ul { list-style: none; margin: 0.4rem 0; padding: 0; max-height: 9rem; overflow: auto; font-size: 0.9rem; }
.chat-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 0.5rem; }
.chat-chips button { font-size: 0.85rem; padding: 0.15rem 0.7rem; border-radius: 999px; }
button.ask { position: relative; font-size: inherit; line-height: 1; padding: 0.15em 0.3em; border-color: transparent; vertical-align: middle; }
button.ask svg { display: block; width: 1.1em; height: 1.1em; }
button.ask:hover { background: var(--panel); border-color: var(--line); }
@media (pointer: coarse) { button.ask::after { content: ""; position: absolute; inset: -6px -8px; } }
button.ask:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.chat-form { display: flex; gap: 0.5rem; }
.chat-form input { flex: 1; min-width: 0; }
`;

/**
 * On the document `page`: a click anywhere but on an open menu's own name closes that menu; Escape closes an open menu,
 * and follows the open box's own close link. The listeners are added once however often this runs on the page.
 */
export function closing(page) {
  if (page.closesOnEscape) return;
  page.closesOnEscape = true;
  const closeMenus = (except) => {
    for (const menu of page.querySelectorAll("details.menu[open]"))
      if (menu !== except) menu.open = false;
  };
  page.addEventListener("click", (event) =>
    closeMenus(event.target.closest?.("summary")?.parentElement),
  );
  page.addEventListener("keydown", (event) => {
    const { location } = page.defaultView;
    if (event.isComposing || event.defaultPrevented) return;
    if (event.key !== "Escape") return;
    closeMenus();
    const close = page.querySelector(".dialog:target .close");
    if (close) close.click();
    else if (location.hash !== "") location.hash = "";
  });
}

/**
 * In a page rendered to a string, under `root`: a heading sorts its table by its column, one way then the other, and a
 * filter box hides the rows without its text, as `Table` does in a browser.
 */
export function sortAndFilter(root, by = compare) {
  root.addEventListener("click", (event) => {
    const button = event.target.closest?.("th button");
    if (!button) return;
    const th = button.parentElement;
    const at = [...th.parentElement.children].indexOf(th);
    const up = th.getAttribute("aria-sort") !== "ascending";
    for (const other of th.parentElement.children)
      other.removeAttribute("aria-sort");
    th.setAttribute("aria-sort", up ? "ascending" : "descending");
    const body = th.closest("table").tBodies[0];
    const key = (row) => row.cells[at].dataset.key;
    [...body.rows]
      .sort((a, b) => (up ? 1 : -1) * by(button.dataset.type, key(a), key(b)))
      .forEach((row) => body.append(row));
  });
  root.addEventListener("input", (event) => {
    const input = event.target;
    if (!input.matches?.(".filter")) return;
    const wanted = input.value.trim().toLowerCase();
    for (const row of input.parentElement.querySelectorAll("tbody tr"))
      row.hidden = !row.textContent.toLowerCase().includes(wanted);
  });
}

/**
 * On the document `page`, rendered to a string: a form's submit turns every button off, says the form's `data-doing`
 * in the page's `doing` line and sets `data-state="busy"` on the body until the page changes; a second submit
 * meanwhile does nothing. A page shown again from the browser's history is on again.
 */
export function busyForms(page) {
  const line = page.querySelector(".doing");
  const busy = (on, said) => {
    if (on) page.body.dataset.state = "busy";
    else delete page.body.dataset.state;
    for (const button of page.querySelectorAll("button")) button.disabled = on;
    line.hidden = !on;
    line.querySelector(".said").textContent = said ?? "";
  };
  page.addEventListener("submit", (event) => {
    if (event.defaultPrevented) return;
    if (page.body.dataset.state === "busy") return event.preventDefault();
    busy(true, event.target.dataset.doing ?? "Working…");
  });
  page.defaultView.addEventListener("pageshow", (event) => {
    if (event.persisted) busy(false);
  });
}

/**
 * On the document `page`, rendered to a string: the chat strip (`Chat`) talks to `POST /chat`. Chats are kept by the
 * browser in `localStorage` as `{ id, pod, title, context?, messages, updated }`, each under the pod it is about; the
 * open chat's ID is in `sessionStorage` under `cascade.chat.open`, so the page an `open` moves the app to reopens it.
 * A message is `{ role: "user" | "assistant", content, findings?, kind? }`; only `user` and `assistant` text without a
 * `kind` (a refusal or an error, which the model did not say) is sent, the newest within `budget` characters. Any
 * element with `data-ask` (a JSON context) starts a new chat with that context, and one with `data-ask-text` sends its
 * text as typed. A `data-ask` click also sends `first(context)`, when it names one, as the person's first question; a
 * turn still running is stopped first. The listeners are added once. A strip with `data-encrypted="true"` keeps its
 * chats only in the page: nothing goes to `localStorage` or `sessionStorage`.
 */
export function chatStrip(page, budget = 24000, first = undefined) {
  const strip = page.querySelector(".chat[data-pod]");
  if (!strip || strip.ready) return;
  strip.ready = true;
  const win = page.defaultView;
  const pod = strip.dataset.pod;
  const log = strip.querySelector(".chat-log");
  const about = strip.querySelector(".chat-about");
  const chips = strip.querySelector(".chat-chips");
  const input = strip.querySelector("input");
  const send = strip.querySelector(".chat-send");
  const stop = strip.querySelector(".chat-stop");
  const recent = strip.querySelector(".chat-recent");
  const SAVED = "cascade.chats";
  const OPEN = "cascade.chat.open";
  const FOLDED = "cascade.chat.folded";
  const ENTRIES = 30;
  const podOf = (address) => {
    const at = /^\/pods\/([^/]+)\//.exec(address);
    return at ? decodeURIComponent(at[1]) : "";
  };
  const storing = (action) => {
    try {
      return action();
    } catch {
      return undefined;
    }
  };
  const sealed = strip.dataset.encrypted === "true";
  let inPage = [];
  const load = () => {
    if (sealed) return inPage;
    const saved = storing(() => JSON.parse(win.localStorage.getItem(SAVED)));
    return Array.isArray(saved) ? saved : [];
  };
  const fresh = (context, label) => ({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    pod,
    title: "",
    ...(context === undefined ? {} : { context, label }),
    messages: [],
    updated: Date.now(),
  });
  let chats = load();
  const opened = storing(() => win.sessionStorage.getItem(OPEN));
  let chat =
    chats.find((each) => each.id === opened && each.pod === pod) ?? fresh();
  let running;
  let turn;
  let taken = false;
  for (const kind of ["wheel", "touchmove", "pointerdown", "keydown"])
    log.addEventListener(kind, () => (taken = true), { passive: true });

  const toggle = strip.querySelector(".chat-fold");
  const fold = (folded) => {
    strip.dataset.folded = folded ? "true" : "false";
    toggle.setAttribute("aria-expanded", String(!folded));
    toggle.textContent = folded ? "Show chat" : "Hide chat";
    storing(() => win.sessionStorage.setItem(FOLDED, String(folded)));
  };
  fold(storing(() => win.sessionStorage.getItem(FOLDED)) === "true");

  const keep = () => {
    chat.updated = Date.now();
    chats = [chat, ...load().filter((each) => each.id !== chat.id)]
      .filter((each) => each.messages.length > 0)
      .sort((a, b) => b.updated - a.updated)
      .slice(0, ENTRIES);
    if (sealed) {
      inPage = chats;
      return;
    }
    storing(() => {
      win.localStorage.setItem(SAVED, JSON.stringify(chats));
      win.sessionStorage.setItem(OPEN, chat.id);
    });
  };
  const make = (tag, className, text) => {
    const made = page.createElement(tag);
    if (className) made.className = className;
    if (text !== undefined) made.textContent = text;
    return made;
  };
  const round = (number) => Math.round(number * 10) / 10;
  const side = (name, each, unit) =>
    each.count === 0
      ? `${name}: no results`
      : `${name}: mean ${round(each.mean)} ${unit} over ${each.count} ${each.count === 1 ? "result" : "results"} (${round(each.min)} to ${round(each.max)})`;
  const card = (finding) => {
    const made = make("div", "card");
    const test =
      finding.test.name ?? finding.test.notation ?? finding.test.code;
    made.append(
      make(
        "p",
        "said",
        finding.said ??
          `${test}: not enough results around ${finding.medication.name}`,
      ),
      make("p", "muted", side("Before", finding.before, finding.unit)),
      make("p", "muted", side("After", finding.after, finding.unit)),
    );
    const base = finding.view.replace(/trend\?.*$/, "");
    const rows = make("ul");
    for (const row of finding.rows) {
      const item = make("li");
      const link = make(
        "a",
        "",
        `${row.performed.slice(0, 10)}: ${row.value} ${row.unit}`,
      );
      link.href = `${base}entries/${encodeURIComponent(row.entry)}`;
      item.append(link, " ", make("span", "tag", row.side));
      rows.append(item);
    }
    const open = make("button", "quiet", "Open the trend");
    open.type = "button";
    open.dataset.open = finding.view;
    made.append(rows, open);
    return made;
  };
  const view = (message) => {
    if (message.role === "user") return make("div", "you", message.content);
    if (message.kind)
      return make(
        "div",
        message.kind === "refused" ? "refused" : "failed",
        (message.kind === "refused" ? "The model declined: " : "No answer: ") +
          message.content,
      );
    const made = make("div", "model", message.content);
    for (const finding of message.findings ?? []) made.append(card(finding));
    if (message.stopped) made.append(make("div", "stopped", "Stopped."));
    if (message.cut) made.append(make("div", "stopped", "Cut short."));
    return made;
  };
  const draw = () => {
    log.replaceChildren(...chat.messages.map(view));
    log.hidden = chat.messages.length === 0;
    about.hidden = chat.context === undefined;
    about.textContent = about.hidden ? "" : `About: ${chat.label}`;
    about.title = about.textContent;
    chips.hidden =
      chat.messages.length > 0 ||
      chat.context !== undefined ||
      chips.children.length === 0;
    const at = turn ?? chat.messages.findLastIndex((m) => m.role === "user");
    const asked = at < 0 ? undefined : log.children[at];
    if (asked === undefined) log.scrollTop = log.scrollHeight;
    else if (!taken) {
      const answer = log.children[at + 1] ?? asked;
      const room = log.clientHeight;
      const start =
        answer.getBoundingClientRect().top - asked.getBoundingClientRect().top >
        room * 0.75
          ? answer
          : asked;
      log.scrollTop +=
        start.getBoundingClientRect().top - log.getBoundingClientRect().top;
    }
    send.hidden = running !== undefined;
    stop.hidden = running === undefined;
    const list = recent.querySelector("ul");
    const here = chats.filter((each) => each.pod === pod);
    list.replaceChildren(
      ...(here.length === 0
        ? [make("li", "empty", "No chats yet")]
        : here.map((each) => {
            const item = make("li");
            const button = make("button", "", each.title);
            button.type = "button";
            button.dataset.chat = each.id;
            item.append(button);
            return item;
          })),
    );
  };
  const go = (address) => {
    chat.pod = podOf(address);
    keep();
    win.location.assign(address);
  };
  const wire = () => {
    const kept = [];
    let characters = 0;
    for (const message of chat.messages.slice(0, -1).reverse()) {
      if (message.kind || !message.content) continue;
      characters += message.content.length;
      if (characters > budget && kept.length > 0) break;
      kept.unshift({ role: message.role, content: message.content });
    }
    while (kept[0]?.role === "assistant") kept.shift();
    return kept.slice(-100);
  };
  const note = (kind, content) =>
    chat.messages.push({ role: "assistant", kind, content });

  async function ask(text) {
    text = text.trim();
    if (text === "" || running) return;
    fold(false);
    chat.title ||= text.slice(0, 60);
    turn = chat.messages.length;
    taken = false;
    chat.messages.push({ role: "user", content: text });
    const answer = { role: "assistant", content: "" };
    chat.messages.push(answer);
    running = new win.AbortController();
    keep();
    draw();
    let moveTo;
    let afterTool = false;
    const handle = (event) => {
      if (event.type === "delta") {
        if (afterTool && answer.content !== "") answer.content += "\n\n";
        afterTool = false;
        answer.content += event.text;
      } else if (event.type === "done") answer.cut = event.stop === "length";
      else if (event.type === "tool") {
        afterTool = true;
        if (event.findings)
          answer.findings = [...(answer.findings ?? []), ...event.findings];
        if (event.open) moveTo = event.open;
      } else if (event.type === "refused") note("refused", event.text);
      else if (event.type === "error") note("error", event.message);
    };
    try {
      const response = await win.fetch("/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: running.signal,
        body: JSON.stringify({
          pod: chat.pod,
          page: win.location.pathname + win.location.search,
          messages: wire(),
          ...(chat.context === undefined ? {} : { context: chat.context }),
        }),
      });
      if (!response.ok)
        note(
          "error",
          (await response.json().catch(() => ({}))).error ??
            `the app answered ${response.status}`,
        );
      else {
        const reader = response.body.getReader();
        const decoder = new win.TextDecoder();
        let pending = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop();
          for (const line of lines)
            if (line !== "") {
              handle(JSON.parse(line));
              draw();
            }
        }
      }
    } catch (error) {
      if (error.name === "AbortError") answer.stopped = true;
      else note("error", `the app could not be reached: ${error.message}`);
    }
    running = undefined;
    if (answer.content === "" && !answer.findings && !answer.stopped)
      chat.messages.splice(chat.messages.indexOf(answer), 1);
    keep();
    draw();
    turn = undefined;
    if (moveTo && !answer.stopped) go(moveTo);
    else input.focus();
  }

  const begin = (context, label) => {
    chat = fresh(context, label);
    storing(() => win.sessionStorage.removeItem(OPEN));
    fold(false);
    draw();
    input.focus();
  };
  let turnEnded = Promise.resolve();
  let clicks = 0;
  const asking = async (target) => {
    let context;
    try {
      context = JSON.parse(target.dataset.ask);
    } catch {
      return;
    }
    const mine = ++clicks;
    if (running) {
      if (
        chat.messages.length <= 2 &&
        JSON.stringify(chat.context) === JSON.stringify(context)
      )
        return;
      running.abort();
      await turnEnded;
      if (mine !== clicks) return;
    }
    begin(context, target.dataset.askLabel);
    const question = first?.(context);
    if (question) turnEnded = ask(question);
  };
  strip.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value;
    input.value = "";
    turnEnded = ask(text);
  });
  page.addEventListener("click", (event) => {
    const target = event.target.closest?.(
      "[data-ask], [data-ask-text], [data-open], [data-chat], .chat-new, .chat-stop, .chat-fold",
    );
    if (!target) return;
    if (target.matches(".chat-fold"))
      return fold(strip.dataset.folded !== "true");
    if (target.matches(".chat-stop")) return running?.abort();
    if (target.dataset.ask !== undefined) return asking(target);
    if (running) return;
    if (target.matches(".chat-new")) return begin();
    if (target.dataset.open) return go(target.dataset.open);
    if (target.dataset.chat) {
      chat = chats.find((each) => each.id === target.dataset.chat) ?? chat;
      recent.open = false;
      taken = false;
      fold(false);
      keep();
      return draw();
    }
    if (target.dataset.askText !== undefined)
      turnEnded = ask(target.dataset.askText);
  });
  draw();
}

/** `closing`, `sortAndFilter`, `busyForms` and `chatStrip` as a page's inline script, over the whole document. */
export const SCRIPT = `(${closing})(document);(${sortAndFilter})(document, ${compare});(${encryptedChoice})(document);(${copyWords})(document);(${busyForms})(document);(${chatStrip})(document, 24000, ${firstQuestion});`;
