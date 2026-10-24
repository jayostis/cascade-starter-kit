// A pod's page, as a person reads it: the person's name, how many records from how many places, what is worth a look,
// what changed after a medication started or stopped, a tile per kind of record with its table in a box, and a way
// to bring in more. It is drawn from the pod's answers first; what the tables say of them fills it in once known.
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useRevalidator, type LoaderFunctionArgs } from "react-router";
import {
  BRINGING,
  maps,
  refusal,
  type Abouts,
  type Answers,
  capitalised,
  changeNames,
  compare,
  day,
  dayAt,
  dayInWords,
  entryId,
  type Finding,
  HISTORY,
  hospitalName,
  type How as HowSaid,
  howOf,
  LAB_SECTION,
  LABS,
  localDay,
  named,
  namingCredits,
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
  medicationDay,
  sectionRows,
  SECTIONS,
  sentenceOf,
  type Series,
  slug,
  SMALL,
  SOURCES,
  timeOf,
  trendOfFinding,
  valuesSaid,
  type VariantsSaid,
  worthALook,
  leftSaid,
} from "../said.ts";
import { useAddress } from "./address.tsx";
import { useHost, type ConnectionNow, type PodApi } from "./api.tsx";
import { AskButton } from "./ask.tsx";
import { Chart } from "./chart.tsx";
import { warming, whenNamed } from "./engine.ts";
import { Connection, SignIn, WorldDate } from "./hospitals.tsx";
import {
  bullet,
  bullets,
  buttonQuiet,
  card,
  lead as leadLook,
  muted,
  note,
  row,
  tag,
  tagWarm,
} from "./look.ts";
import { Box, Pending, Tag, useReopenedBox } from "./parts.tsx";
import { screen, useApp, useLate, useRead } from "./screen.tsx";

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
  /** The connection whose box is over the page. */
  readonly connection?: ConnectionNow;
  /** The world's date the hospitals answer as of; none for everything they hold. */
  readonly asOf?: string;
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
        className="filter mt-1 mb-3 w-full"
        placeholder="Filter"
        aria-label={`Filter ${section.title.toLowerCase()}`}
        onChange={(event) =>
          setWanted(event.currentTarget.value.trim().toLowerCase())
        }
      />
      <div className="scroll max-h-[60vh] overflow-auto pr-3">
        <table>
          <thead>
            <tr>
              {columns.map((column, index) => {
                const by =
                  index === at ? (up ? "ascending" : "descending") : undefined;
                return (
                  <th className="group" key={column.head} aria-sort={by}>
                    <button
                      className="inline cursor-pointer rounded-none border-0 bg-transparent p-0 text-[0.78rem] tracking-[0.06em] whitespace-nowrap text-muted uppercase group-[[aria-sort]]:text-accent group-aria-[sort=ascending]:after:content-['_↑'] group-aria-[sort=descending]:after:content-['_↓'] hover:text-accent"
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
                        <span className={column.warm?.(row) ? tagWarm : tag}>
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
    <a
      className={
        by === undefined
          ? "tile block rounded-[10px] border border-line bg-panel px-[1.1rem] py-4 text-text no-underline hover:border-accent hover:bg-tint"
          : "tile block flex-1 bg-panel px-[1.1rem] py-4 text-text no-underline hover:bg-tint"
      }
      key={id}
      href={`#${id}`}
    >
      <span className="kind block text-[0.78rem] tracking-[0.06em] text-muted uppercase">
        {section.title}
      </span>
      <span className="count block text-[2rem] leading-[1.2] font-semibold text-accent">
        {current.length}
      </span>
      <span className="peek mt-[0.2rem] block truncate text-[0.88rem] text-muted">
        {names}
      </span>
    </a>
  );
  return {
    tile:
      by === undefined ? (
        opener
      ) : (
        <div
          className="tile-box flex flex-col overflow-hidden rounded-[10px] border border-line bg-panel hover:border-accent"
          key={id}
        >
          {opener}
          <a
            className="by block border-t border-line px-[1.1rem] py-[0.55rem] font-semibold no-underline hover:bg-tint"
            href={by.href}
            title={by.title}
          >
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
            {section.title} <span className={muted}>{rows.length}</span>
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
    <div className="card worth mb-5 rounded-[10px] border border-transparent bg-tint px-5 py-[1.1rem]">
      <h2>Worth a look</h2>
      <ul className={bullets}>
        {lines.map(({ sentence, entry, tag }) => (
          <li
            className={`arrive ${bullet} animate-arrive motion-reduce:animate-none`}
            key={`${entry} ${sentence}`}
          >
            <a className="text-text hover:text-accent" href={entryHref(entry)}>
              {sentence}
            </a>
            {tag !== undefined && <Tag tag={tag} />}
            <AskButton
              about={{ kind: "worth", entry: entryId(entry) }}
              label={sentence}
            />
          </li>
        ))}
      </ul>
      {waiting && <Pending lines={2} pitch="1.8rem" said="Checking ClinVar…" />}
    </div>
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
  const { key, unit, before, after, left, rows } = finding;
  const id = `change-${slug(key)}`;
  const points = [...rows.before, ...rows.after].map((row) => ({
    time: timeOf(row.performed),
    value: Number(row.value),
  }));
  const marks = [
    {
      time: timeOf(finding.medication.date),
      kind: medicationDay(finding).mark,
      text: "",
    },
  ];
  const plot = plotOf({ points, marks, size: SMALL });
  const sentence = sentenceOf(finding, names);
  const forgone = leftSaid(left);
  const shown = rows.before.length + rows.after.length + rows.left.length;
  const times = points.map((point) => point.time);
  return (
    <div className="change border-t border-line py-[0.9rem] [h2+&]:border-t-0 [h2+&]:pt-0">
      <p className="said font-semibold">{sentence}</p>
      <p>
        {rounded(before.mean)} → {rounded(after.mean)} {unit}, the mean of{" "}
        {resultsSaid(before.count)} before and {after.count} after.
      </p>
      {forgone !== undefined && <p className={muted}>{forgone}</p>}
      <Chart
        id={id}
        plot={plot}
        points={points}
        marks={marks}
        unit={unit}
        title={names.test}
        desc={`${resultsSaid(points.length)} from ${dayAt(Math.min(...times))} to ${dayAt(Math.max(...times))}. ${names.medication} ${medicationDay(finding).said} ${day(finding.medication.date)}.`}
      />
      <p className={row}>
        <a href={`#${id}`}>Show the {resultsSaid(shown)}</a>{" "}
        <a href={trendHref(finding)}>Open the trend</a>
        <AskButton about={{ kind: "finding", key }} label={sentence} />
      </p>
    </div>
  );
}

/** The mechanism behind What changed, as `howOf` gives it: the pulls in order, and each medication's versions. */
function How({ how, about }: { how: HowSaid; about: Abouts }) {
  return (
    <div className="how border-t border-line py-[0.9rem]">
      <h3 className="m-0 mb-[0.3rem] text-[0.95rem]">Where this comes from</h3>
      <p>
        The pod's records came in {how.pulls.length} imports, in this order:
      </p>
      <ol className="my-1 pl-[1.4rem]">
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
      <div className={`${card} changes [&_p]:my-1`}>
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
        <p className={muted}>
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
              <p className={muted}>
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
                  {`${capitalised(names.test)}: ${names.medication} ${medicationDay(finding).said} ${day(finding.medication.date)}, with ${resultsSaid(finding.before.count)} before and ${finding.after.count} after.`}{" "}
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

/**
 * The card that brings in more: the world's date the hospitals answer as of, a sign-in button per hospital holding the
 * demo person, and Find a hospital. It says nothing of what a hospital holds: nothing here asks it.
 */
function BringIn({
  empty,
  person,
  asOf,
  findHospital,
}: {
  empty: boolean;
  person: Person | undefined;
  asOf: string | undefined;
  findHospital: string;
}) {
  return (
    <div className={card}>
      <h2>{empty ? "Bring in records" : "Bring in more"}</h2>
      <p>Sign in at a hospital, see what it has, and bring it into this pod.</p>
      <WorldDate asOf={asOf} />
      <div className={row}>
        {(person?.at ?? []).map((hospital) => (
          <SignIn key={hospital.fhirBase} fhirBase={hospital.fhirBase}>
            Sign in at {hospitalName(hospital.name)}
          </SignIn>
        ))}
        <a className={buttonQuiet} href={findHospital}>
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
  useReopenedBox(shown.pod);
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
      <p className={leadLook}>{lead}</p>
      {places.length > 0 && (
        <ul className="chips mt-0 mr-0 mb-6 ml-0 flex list-none flex-wrap gap-[0.4rem] p-0">
          {places.map((place) => (
            <li
              className="rounded-full border border-line bg-panel px-[0.6rem] py-[0.15rem] text-[0.82rem] text-muted"
              key={place}
            >
              {place}
            </li>
          ))}
        </ul>
      )}
      {from !== undefined && (
        <p className={note}>Brought in the record from {hospitalName(from)}.</p>
      )}
      {unheld.length > 0 && (
        <p className={note}>
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
          <div className={`${card} changes [&_p]:my-1`}>
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
        <div
          className="tiles mb-5 grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-4"
          aria-busy={about === undefined || undefined}
        >
          {tiles.map(({ tile }) => tile)}
        </div>
      )}
      {about === undefined && tiles.length > 0 ? (
        <Pending lines={3} pitch="2rem" said="Loading the credits…" />
      ) : (
        credits.map((credit) => (
          <p
            className={`${muted} arrive animate-arrive motion-reduce:animate-none`}
            key={credit}
          >
            {credit}
          </p>
        ))
      )}
      {tiles.map(({ dialog }) => dialog)}
      <BringIn
        empty={records === 0}
        person={person}
        asOf={shown.asOf}
        findHospital={address.hospitals(pod)}
      />
      {shown.connection !== undefined && (
        <Connection
          key={shown.connection.n}
          pod={pod}
          titles={titles}
          now={shown.connection}
        />
      )}
    </>
  );
}

/** What the tables say of a pod's codes and variants; no names when they cannot say. */
type Named = Pick<PodShown, "about" | "said">;

/** What a pod's page is drawn from: its answers now, and the tables' names of them, at once or as they come. */
interface PodRead {
  readonly shown: Omit<PodShown, "about" | "said">;
  readonly named: Named | Promise<Named>;
}

async function namedOf(api: PodApi, pod: string): Promise<Named> {
  try {
    const { about, said } = maps(await api.said({ pod })) as {
      about?: Abouts;
      said?: VariantsSaid;
    };
    return { about: about ?? new Map(), ...(said !== undefined && { said }) };
  } catch {
    return { about: new Map() };
  }
}

/** The pod's connection numbered `n` in the address, as `connection` gives it; none for no number, or one it has not. */
async function connectionAt(
  api: PodApi,
  pod: string,
  n: string | null,
): Promise<ConnectionNow | undefined> {
  if (n === null || !/^\d+$/.test(n)) return undefined;
  try {
    return await api.connection({ pod, connection: Number(n) });
  } catch (error) {
    if (error instanceof Error && error.name === "Refusal") return undefined;
    throw error;
  }
}

/**
 * Reads the pod the address names, with the connection its `connection` names in a box over it: while that connection
 * signs in, fetches or brings its record in, the page is busy with it, and once it failed where Try again can help, it
 * went wrong.
 */
export const podLoader = (api: PodApi) =>
  screen(async ({ params, request }: LoaderFunctionArgs) => {
    const pod = params.pod ?? "";
    const { pods } = await api.pods();
    if (!pods.some(({ name }) => name === pod))
      throw refusal(`This app keeps no pod named ${pod}.`);
    const [answered, { asOf }, connection] = await Promise.all([
      api.answers({ pod }),
      api.hospitals({}),
      connectionAt(
        api,
        pod,
        new URL(request.url).searchParams.get("connection"),
      ),
    ]);
    const named = whenNamed(
      () => namedOf(api, pod),
      { about: new Map() },
      "the pod's names",
    );
    const titles = new Map(pods.map(({ name, title }) => [name, title]));
    return {
      value: {
        shown: {
          pod,
          ...answered,
          ...(asOf !== undefined && { asOf }),
          ...(connection?.broughtIn
            ? { from: connection.row.name }
            : connection !== undefined && { connection }),
        },
        named: warming() ? named : await named,
      } satisfies PodRead,
      title: personName(pod, titles),
      ...(connection !== undefined &&
        !connection.broughtIn &&
        !connection.settled && {
          busy: connection.step === "bringing in" ? BRINGING : "Signing in…",
        }),
      ...(connection?.retry === true && {
        failed: `the connection failed: ${connection.failed ?? connection.step}`,
      }),
    };
  });

/**
 * The connection `read` as it moves on: while it is under way, each change is drawn as it comes, and once it has
 * settled or brought its record in, the page is read again.
 */
function useFollowed(
  pod: string,
  read: ConnectionNow | undefined,
): ConnectionNow | undefined {
  const { api } = useHost();
  const { revalidate } = useRevalidator();
  const [now, setNow] = useState<{ of: ConnectionNow; now: ConnectionNow }>();
  useEffect(() => {
    if (read === undefined || read.settled) return;
    const stop = new AbortController();
    void (async () => {
      for (let wait: "change" | undefined; ; wait = "change") {
        const next = await api.connection({ pod, connection: read.n, wait });
        if (stop.signal.aborted) return;
        if (next.broughtIn === true) return revalidate();
        flushSync(() => setNow({ of: read, now: next }));
        if (next.settled) return revalidate();
      }
    })().catch(() => {
      if (!stop.signal.aborted) void revalidate();
    });
    return () => stop.abort();
  }, [api, pod, read, revalidate]);
  return now !== undefined && now.of === read ? now.now : read;
}

/** The pod the address names, drawn from its answers, then filled in once the tables can say what they say of them. */
export function PodScreen() {
  const { shown, named } = useRead<PodRead>();
  const { titles, people, held } = useApp();
  const said = useLate(named);
  const tables = useLate(held);
  const connection = useFollowed(shown.pod, shown.connection);
  return (
    <PodPage
      shown={{
        ...shown,
        ...said,
        ...(connection !== undefined && { connection }),
      }}
      titles={titles}
      person={people.find((each) => slug(each.name) === shown.pod)}
      held={tables?.held ?? []}
    />
  );
}
