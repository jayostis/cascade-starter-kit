// A pod's page, as a person reads it: the person's name, how many records from how many places, what is worth a look,
// what changed after a medication started or stopped, a tile per kind of record with its table in a box, and a way
// to bring in more. It is drawn from the pod's answers first; what the tables say of them fills it in once known.
import { useState } from "react";
import {
  type Abouts,
  type Answers,
  capitalised,
  changeNames,
  compare,
  day,
  dayAt,
  dayInWords,
  type Finding,
  HISTORY,
  hospitalName,
  type How as HowSaid,
  howOf,
  LAB_SECTION,
  LABS,
  localDay,
  monthAt,
  named,
  namingCredits,
  near,
  opening,
  type Person,
  personName,
  placeOf,
  plotOf,
  pullSaid,
  REPORTS,
  resultsSaid,
  rounded,
  type SectionRow as Row,
  type Section,
  sectionRows,
  SECTIONS,
  sentenceOf,
  type Series,
  slug,
  SMALL,
  SOURCES,
  spread,
  timeOf,
  trendOfFinding,
  valuesSaid,
  type VariantsSaid,
  worthALook,
  leftSaid,
  DAY_MS,
} from "../said.ts";
import { useAddress } from "./address.tsx";
import { Box, Pending, PostButton, Tag } from "./parts.tsx";

/** What a pod's page is drawn from: its answers, and once the tables can say, what they say of them. */
export interface PodShown {
  readonly pod: string;
  readonly answers: Answers;
  readonly changes?: readonly Finding[];
  readonly unheld?: readonly string[];
  /** The tables' names of the pod's codes; undefined while still asked, empty when they cannot say. */
  readonly about?: Abouts;
  readonly said?: VariantsSaid;
  /** The hospital a record was just brought in from. */
  readonly from?: string;
}

/**
 * A section's filter box and table of `rows`, given in `opening` order, a heading button per column, each cell holding
 * what it sorts by in `data-key`: a heading sorts by its column, one way then the other, and the filter hides the rows
 * without its text.
 */
function Table({
  section,
  rows,
  entryHref,
}: {
  section: Section;
  rows: readonly Row[];
  entryHref: (entry: string) => string;
}) {
  const [sort, setSort] = useState<{ at: number; up: boolean }>();
  const [wanted, setWanted] = useState("");
  const { at, up } = sort ?? { at: section.sortBy, up: !section.newestFirst };
  const columns = section.columns;
  const shown = (column: (typeof columns)[number], row: Row) =>
    column.show(row) ?? "";
  const key = (row: Row) => String(columns[at]?.key(row) ?? "");
  const sorted =
    at === section.sortBy && up === !section.newestFirst
      ? rows
      : [...rows].sort(
          (a, b) =>
            (up ? 1 : -1) *
            compare(columns[at]?.type ?? "text", key(a), key(b)),
        );
  return (
    <>
      <input
        type="search"
        className="filter"
        placeholder="Filter"
        aria-label={`Filter ${section.title.toLowerCase()}`}
        onChange={(event) =>
          setWanted(event.currentTarget.value.trim().toLowerCase())
        }
      />
      <div className="scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column, index) => {
                const by =
                  index === at ? (up ? "ascending" : "descending") : undefined;
                return (
                  <th key={column.head} aria-sort={by}>
                    <button
                      type="button"
                      data-type={column.type}
                      onClick={() =>
                        setSort({ at: index, up: by !== "ascending" })
                      }
                    >
                      {column.head}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, place) => {
              const hidden = ![
                ...columns.map((column) => shown(column, row)),
                ...(row.tags ?? []),
              ]
                .join("")
                .toLowerCase()
                .includes(wanted);
              return (
                <tr
                  key={`${row.entry ?? ""} ${place}`}
                  hidden={hidden || undefined}
                >
                  {columns.map((column, index) => {
                    const text = shown(column, row);
                    const cell =
                      column.tag && text !== "" ? (
                        <span
                          className={`tag${column.warm?.(row) ? " warm" : ""}`}
                        >
                          {text}
                        </span>
                      ) : (
                        text
                      );
                    return (
                      <td key={column.head} data-key={column.key(row) ?? ""}>
                        {index === 0 && row.entry !== undefined ? (
                          <a href={entryHref(row.entry)}>{cell}</a>
                        ) : (
                          cell
                        )}
                        {index === 0 &&
                          (row.tags ?? []).map((tag) => (
                            <Tag key={tag} tag={tag} />
                          ))}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** The section's tile, a link that opens its box, and the box with its `Table`; the current rows counted and named. */
function tile(
  section: Section,
  rows: readonly Row[],
  entryHref: (entry: string) => string,
  by?: { href: string; label: string; title: string },
) {
  const id = `see-${slug(section.title)}`;
  const opened = opening(section, rows);
  const current =
    section.current === undefined ? opened : opened.filter(section.current);
  const stopped = opened.length - current.length;
  const names = [
    ...current.map((row) => String(row[section.field] ?? "")),
    ...(stopped > 0
      ? [`${current.length > 0 ? "and " : ""}${stopped} stopped`]
      : []),
  ].join(", ");
  const opener = (
    <a className="tile" key={id} href={`#${id}`}>
      <span className="kind">{section.title}</span>
      <span className="count">{current.length}</span>
      <span className="peek">{names}</span>
    </a>
  );
  return {
    tile:
      by === undefined ? (
        opener
      ) : (
        <div className="tile-box" key={id}>
          {opener}
          <a className="by" href={by.href} title={by.title}>
            {by.label}
          </a>
        </div>
      ),
    dialog: (
      <Box
        key={id}
        id={id}
        heading={
          <>
            {section.title} <span className="muted">{rows.length}</span>
          </>
        }
        wide
      >
        <Table section={section} rows={opened} entryHref={entryHref} />
      </Box>
    ),
  };
}

/** What is worth a look, each line a link to its entry, then its tag; while a line is still to come, room for one. */
function Worth({
  lines,
  entryHref,
  waiting,
}: {
  lines: readonly { sentence: string; entry: string; tag?: string }[];
  entryHref: (entry: string) => string;
  waiting: boolean;
}) {
  if (lines.length === 0 && !waiting) return null;
  return (
    <div className="card worth">
      <h2>Worth a look</h2>
      <ul>
        {lines.map(({ sentence, entry, tag }) => (
          <li className="arrive" key={`${entry} ${sentence}`}>
            <a href={entryHref(entry)}>{sentence}</a>
            {tag !== undefined && <Tag tag={tag} />}
          </li>
        ))}
      </ul>
      {waiting && <Pending lines={2} pitch="1.8rem" said="Checking ClinVar…" />}
    </div>
  );
}

interface Point {
  readonly time: number;
  readonly value: number;
}
interface Mark {
  readonly time: number;
  readonly kind: string;
  readonly text: string;
}

/** A line of results over time, as SVG: a marker for each point and the days in `marks` as dashed lines across it. */
function Chart({
  id,
  plot,
  points,
  marks = [],
  unit,
  title,
  desc,
  axes = false,
}: {
  id: string;
  plot: ReturnType<typeof plotOf>;
  points: readonly Point[];
  marks?: readonly Mark[];
  unit: string;
  title: string;
  desc: string;
  axes?: boolean;
}) {
  const { width, height, margin, radius, from, to, low, high, x, y } = plot;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const right = width - margin.right;
  const bottom = height - margin.bottom;
  const days = (to - from) / DAY_MS;
  return (
    <svg
      className={`chart ${axes ? "large" : "small"}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${id}-title ${id}-desc`}
    >
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-desc`}>{desc}</desc>
      {axes &&
        spread(4, low, high).map((value) => (
          <g key={`y${value}`}>
            <line
              className="grid"
              x1={margin.left}
              x2={right}
              y1={near(y(value))}
              y2={near(y(value))}
            />
            <text
              className="tick"
              x={margin.left - 8}
              y={near(y(value)) + 4}
              textAnchor="end"
            >
              {rounded(value)}
            </text>
          </g>
        ))}
      {axes &&
        spread(5, from, to).map((time) => (
          <text
            key={`x${time}`}
            className="tick"
            x={near(x(time))}
            y={bottom + 20}
            textAnchor="middle"
          >
            {days >= 150 ? monthAt(time) : dayAt(time)}
          </text>
        ))}
      {marks.map(({ time, kind, text }) => (
        <g key={`${kind}${time}`}>
          <line
            className={`mark ${kind}`}
            x1={near(x(time))}
            x2={near(x(time))}
            y1={margin.top}
            y2={bottom}
          />
          {axes && (
            <text
              className="tick"
              x={near(x(time))}
              y={margin.top - 10}
              textAnchor={x(time) > width / 2 ? "end" : "start"}
            >
              {text}
            </text>
          )}
        </g>
      ))}
      <polyline
        className="series"
        fill="none"
        points={sorted
          .map(({ time, value }) => `${near(x(time))},${near(y(value))}`)
          .join(" ")}
      />
      {sorted.map(({ time, value }, at) => (
        <circle
          key={at}
          className="marker"
          cx={near(x(time))}
          cy={near(y(value))}
          r={radius}
        >
          <title>{`${dayAt(time)}: ${rounded(value)} ${unit}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** One finding as a card: what changed, the means, what was left out, a small chart and the links to its results and trend. */
function Change({
  finding,
  names,
  trendHref,
}: {
  finding: Finding;
  names: { test: string; medication: string };
  trendHref: (finding: Finding) => string;
}) {
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
  const times = points.map((point) => point.time);
  return (
    <div className="change">
      <p className="said">{sentence}</p>
      <p>
        {rounded(before.mean)} → {rounded(after.mean)} {unit}, the mean of{" "}
        {resultsSaid(before.count)} before and {after.count} after.
      </p>
      {forgone !== undefined && <p className="muted">{forgone}</p>}
      <Chart
        id={id}
        plot={plot}
        points={points}
        marks={marks}
        unit={unit}
        title={names.test}
        desc={`${resultsSaid(points.length)} from ${dayAt(Math.min(...times))} to ${dayAt(Math.max(...times))}. ${names.medication} ${kind === "after start" ? "started" : "stopped"} ${day(finding.medication.date)}.`}
      />
      <p className="row">
        <a href={`#${id}`}>Show the {resultsSaid(shown)}</a>{" "}
        <a href={trendHref(finding)}>Open the trend</a>
      </p>
    </div>
  );
}

/** The mechanism behind What changed, as `howOf` gives it: the pulls in order, and each medication's versions. */
function How({ how, about }: { how: HowSaid; about: Abouts }) {
  return (
    <div className="how">
      <h3>Where this comes from</h3>
      <p>
        The pod's records came in {how.pulls.length} imports, in this order:
      </p>
      <ol>
        {how.pulls.map((pull, at) => (
          <li key={at}>{pullSaid(pull)}</li>
        ))}
      </ol>
      {how.revisions.flatMap(({ finding, steps }) =>
        steps.map((step, at) => (
          <p key={`${finding.key} ${at}`}>
            {capitalised(changeNames(finding, about).medication)} came in a new
            version: version {step.from} to version {step.to}, in import{" "}
            {step.pull},{" "}
            {step.asOf === undefined
              ? `on ${localDay(step.arrived)}`
              : `as of ${dayInWords(step.asOf)}`}
            .
            {step.said.length > 0 &&
              ` ${capitalised(step.said.map(({ field, before, after }) => `${field} ${valuesSaid(before)} → ${valuesSaid(after)}`).join("; "))}.`}
          </p>
        )),
      )}
    </div>
  );
}

/**
 * What changed in the pod's lab results after a medication started or stopped: a card for each change, strongest first;
 * one line for the pairs with too few results to say anything; and with `how`, how the pod came to hold what it reads.
 */
function Changed({
  changes,
  about,
  how,
  entryHref,
  trendHref,
}: {
  changes: readonly Finding[];
  about: Abouts;
  how: HowSaid | undefined;
  entryHref: (entry: string) => string;
  trendHref: (finding: Finding) => string;
}) {
  const shown = changes.filter(
    ({ direction }) => direction !== "not enough results",
  );
  const thin = changes.filter(
    ({ direction }) => direction === "not enough results",
  );
  return (
    <>
      <div className="card changes">
        <h2>What changed</h2>
        {shown.length === 0 ? (
          <p>Nothing stands out yet.</p>
        ) : (
          shown.map((finding) => (
            <Change
              key={finding.key}
              finding={finding}
              names={changeNames(finding, about)}
              trendHref={trendHref}
            />
          ))
        )}
        {thin.length > 0 && (
          <p>
            {thin.length} {thin.length === 1 ? "pair" : "pairs"} of a medication
            and a test had too few results to say anything.{" "}
            <a href="#too-few">Show {thin.length === 1 ? "it" : "them"}</a>
          </p>
        )}
        {shown.length > 0 && how !== undefined && (
          <How how={how} about={about} />
        )}
        <p className="muted">
          These say what changed after what, never why. A clinician can say why.
        </p>
      </div>
      {shown.map((finding) => {
        const { rows } = finding;
        const all = [...rows.before, ...rows.after, ...rows.left];
        return (
          <Box
            key={finding.key}
            id={`change-${slug(finding.key)}`}
            heading={`${changeNames(finding, about).test} results`}
            wide
          >
            {rows.left.length > 0 && (
              <p className="muted">
                {rows.left.length} of these{" "}
                {rows.left.length === 1 ? "was" : "were"} left out of the means.
              </p>
            )}
            <Table
              section={LAB_SECTION}
              rows={opening(LAB_SECTION, all)}
              entryHref={entryHref}
            />
          </Box>
        );
      })}
      {thin.length > 0 && (
        <Box id="too-few" heading="Too few results to say anything">
          <ul>
            {thin.map((finding) => {
              const names = changeNames(finding, about);
              return (
                <li key={finding.key}>
                  {capitalised(names.test)} and {names.medication},{" "}
                  {finding.kind === "after start" ? "started" : "stopped"}{" "}
                  {day(finding.medication.date)}:{" "}
                  {resultsSaid(finding.before.count)} before,{" "}
                  {finding.after.count} after.{" "}
                  <a href={trendHref(finding)}>Open the trend</a>
                </li>
              );
            })}
          </ul>
        </Box>
      )}
    </>
  );
}

/** The card that brings in more: a sign-in button per hospital holding the demo person, and Find a hospital. */
function BringIn({
  empty,
  person,
  findHospital,
}: {
  empty: boolean;
  person: Person | undefined;
  findHospital: string;
}) {
  return (
    <div className="card">
      <h2>{empty ? "Bring in records" : "Bring in more"}</h2>
      <p>Sign in at a hospital, see what it has, and bring it into this pod.</p>
      <div className="row">
        {(person?.at ?? []).map((hospital) => (
          <PostButton
            key={hospital.fhirBase}
            action="sign-in"
            fields={{ fhirBase: hospital.fhirBase }}
            doing="Signing in…"
          >
            Sign in at {hospitalName(hospital.name)}
          </PostButton>
        ))}
        <a className="button quiet" href={findHospital}>
          Find a hospital
        </a>
      </div>
    </div>
  );
}

/** A pod's page, as `shown` gives it; `person` is the demo person it is for, `held` the series the app holds. */
export function PodPage({
  shown,
  titles,
  person,
  held,
}: {
  shown: PodShown;
  titles: ReadonlyMap<string, string>;
  person: Person | undefined;
  held: readonly Series[];
}) {
  const address = useAddress();
  const {
    pod,
    answers: asked,
    about,
    said,
    changes,
    unheld = [],
    from,
  } = shown;
  const entryHref = (entry: string) => address.entry(pod, entry);
  const trendHref = (finding: Finding) =>
    address.trend(pod, trendOfFinding(finding));
  const names: Abouts = about ?? new Map();
  const answers = named(asked, names);
  const credits = namingCredits(asked, names, held);
  const sources = answers[SOURCES] ?? [];
  const records = new Set(sources.map((row) => row.record)).size;
  const places = [...new Set(sources.map(placeOf))];
  const due =
    changes !== undefined &&
    (answers[HISTORY] ?? []).length > 0 &&
    (answers[LABS] ?? []).length > 0;
  const tiles = SECTIONS.map(
    (section) => [section, sectionRows(section, answers, said)] as const,
  )
    .filter(([, rows]) => rows.length > 0)
    .map(([section, rows]) =>
      tile(
        section,
        rows,
        entryHref,
        section.one === "medication"
          ? {
              href: address.classes(pod),
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
  return (
    <>
      <h1>{personName(pod, titles)}</h1>
      <p className="lead">{lead}</p>
      {places.length > 0 && (
        <ul className="chips">
          {places.map((place) => (
            <li key={place}>{place}</li>
          ))}
        </ul>
      )}
      {from !== undefined && (
        <p className="note">Brought in the record from {hospitalName(from)}.</p>
      )}
      {unheld.length > 0 && (
        <p className="note">
          This pod was matched with{" "}
          {unheld.length === 1
            ? "a reference table version"
            : `${unheld.length} reference table versions`}{" "}
          this app does not hold, and is matched without{" "}
          {unheld.length === 1 ? "it" : "them"}.
        </p>
      )}
      <Worth
        lines={worthALook(answers, names, said)}
        entryHref={entryHref}
        waiting={
          about === undefined &&
          said === undefined &&
          (answers[REPORTS] ?? []).length > 0
        }
      />
      {due &&
        (about === undefined ? (
          <div className="card changes">
            <h2>What changed</h2>
            <Pending lines={4} said="Naming what changed…" />
          </div>
        ) : (
          <Changed
            changes={changes}
            about={names}
            how={howOf(
              asked,
              changes.filter(
                ({ direction }) => direction !== "not enough results",
              ),
            )}
            entryHref={entryHref}
            trendHref={trendHref}
          />
        ))}
      {tiles.length > 0 && (
        <div className="tiles">{tiles.map(({ tile }) => tile)}</div>
      )}
      {about === undefined && tiles.length > 0 ? (
        <Pending lines={3} pitch="2rem" said="Loading the credits…" />
      ) : (
        credits.map((credit) => (
          <p className="muted arrive" key={credit}>
            {credit}
          </p>
        ))
      )}
      {tiles.map(({ dialog }) => dialog)}
      <BringIn
        empty={records === 0}
        person={person}
        findHospital={address.hospitals(pod)}
      />
    </>
  );
}
