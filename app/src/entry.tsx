// An entry's page, as a person reads it: its name and tags, what it is, where it came from and what else is known, each
// part absent when it has nothing to say but where it came from. It is drawn from the pod's answers first; once the
// engine is ready the tables add the codes' names, the LOINC panels a lab result is in and the versions that joined it.
import { Fragment } from "react";
import type { LoaderFunctionArgs } from "react-router";
import {
  capitalised,
  day,
  entryId,
  entryOf,
  localDay,
  maps,
  panelsOf,
  REQUIRED,
  sourcesOf,
  tableId,
  type Abouts,
  type Answers,
  type Entry,
  type Series,
  type VariantsSaid,
  versionName,
} from "../said.ts";
import { useAddress } from "./address.tsx";
import type { PodApi } from "./api.tsx";
import { AskButton } from "./ask.tsx";
import { warming, whenNamed } from "./engine.ts";
import {
  bullet,
  bullets,
  card,
  factName,
  facts as factsLook,
  factValue,
  lead,
  muted,
} from "./look.ts";
import { Pending, Tag } from "./parts.tsx";
import {
  Back,
  NotFound,
  screen,
  sourceOf,
  useApp,
  useLate,
  useRead,
} from "./screen.tsx";

type Panels = Awaited<ReturnType<typeof panelsOf>>;

/** What an entry's page is drawn from: the entry, if the pod holds it, and the panels its test is in. */
interface EntryRead {
  readonly entry: Entry | undefined;
  readonly panels: Panels;
  /** Whether what the tables say of the entry, its panels among it, is still to come. */
  readonly coming?: boolean;
}

export function EntryPage({
  pod,
  titles,
  read,
  held,
  engine,
}: {
  pod: string;
  titles: ReadonlyMap<string, string>;
  read: EntryRead;
  held: readonly Series[];
  engine: "waiting" | "ready" | "failed";
}) {
  const address = useAddress();
  const { entry, panels } = read;
  if (entry === undefined)
    return (
      <>
        <Back pod={pod} titles={titles} />
        <NotFound said="This entry is no longer in this pod." />
      </>
    );
  const sources = sourcesOf(held);
  const tableHref = (series: Series) => address.table(tableId(series.iri));
  const { name, kind, tags, what, recorded, codes, known, credits } = entry;
  const facts = [
    ...(recorded === undefined
      ? []
      : [{ head: "Recorded as", text: recorded }]),
    ...what,
  ];
  return (
    <>
      <Back pod={pod} titles={titles} />
      <h1>
        {name}
        {tags.map((tag) => (
          <Tag key={tag} tag={tag} />
        ))}
      </h1>
      <p className={lead}>
        {capitalised(kind)}
        <AskButton
          about={{ kind: "entry", id: entryId(entry.entry) }}
          label={name}
        />
      </p>
      {(facts.length > 0 || codes.length > 0) && (
        <div className={`${card} entry`}>
          <h2>What it is</h2>
          <dl className={factsLook}>
            {facts.map(({ head, text }) => (
              <Fragment key={head}>
                <dt className={factName}>{head}</dt>
                <dd className={factValue}>{text}</dd>
              </Fragment>
            ))}
            {codes.length > 0 && (
              <>
                <dt className={factName}>
                  {codes.length === 1 ? "Code" : "Codes"}
                </dt>
                <dd className={factValue}>
                  {codes.map(({ series, notation }, at) => {
                    const source =
                      series === undefined
                        ? undefined
                        : sourceOf(sources, series);
                    return (
                      <span key={notation}>
                        {at > 0 && ", "}
                        {source === undefined ? (
                          notation
                        ) : (
                          <a
                            href={address.table(tableId(source.iri), {
                              code: notation,
                            })}
                          >
                            {notation}
                          </a>
                        )}
                      </span>
                    );
                  })}
                </dd>
              </>
            )}
          </dl>
        </div>
      )}
      <div className={`${card} entry`}>
        <h2>Where it came from</h2>
        <ul className={bullets}>
          {entry.where.map(
            ({ place, issued, retrieved, arrived, importLabel, records }) => (
              <li
                className={bullet}
                key={`${place} ${issued ?? ""} ${arrived ?? ""}`}
              >
                <strong>{place}</strong>{" "}
                <span className={muted}>
                  {[
                    issued !== undefined && `report of ${day(issued)}`,
                    retrieved !== undefined &&
                      `retrieved ${localDay(retrieved)}`,
                    arrived !== undefined &&
                      `arrived ${localDay(arrived)}${importLabel === undefined ? "" : ` through ${importLabel}`}`,
                    records > 1 && `${records} records`,
                  ]
                    .filter(Boolean)
                    .join("; ")}
                </span>
              </li>
            ),
          )}
        </ul>
      </div>
      {known.length > 0 && (
        <div className={`${card} entry`}>
          <h2>What else is known</h2>
          <ul className={bullets}>
            {known.map(({ sentence, tag, from, fromLead = "From" }, at) => (
              <li className={bullet} key={`${at} ${sentence ?? ""}`}>
                {sentence}
                {tag !== undefined && <Tag tag={tag} />}
                {from !== undefined && (
                  <>
                    {" "}
                    <span className={`${muted} from block`}>
                      {fromLead} {from.series.label},{" "}
                      <a href={tableHref(from.series)}>
                        {versionName(from.version)}
                      </a>
                      .
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {credits.map((credit) => (
            <p key={credit} className={muted}>
              {credit}
            </p>
          ))}
        </div>
      )}
      {panels.map(({ series, version, total, panels: listing }) => (
        <div key={`${series.iri} ${version.iri}`} className={`${card} entry`}>
          <h2>In LOINC panels</h2>
          <p>
            {series.label} lists this test in{" "}
            {total === 1 ? "one panel" : `${total.toLocaleString("en")} panels`}
            . A panel's page shows the results you have in it; it does not say
            this result was drawn as part of one.
          </p>
          <ul className={`members ${bullets}`}>
            {listing.map((each) => (
              <li className={bullet} key={each.code}>
                <a href={address.panel(pod, each.code)}>
                  {each.about?.name?.label ?? each.notation}
                </a>
                {each.required !== undefined && (
                  <>
                    {" "}
                    <span className={muted}>
                      {REQUIRED[each.required] ?? each.required}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {total > listing.length && (
            <p className={muted}>
              and {(total - listing.length).toLocaleString("en")} more.
            </p>
          )}
          {series.credit !== undefined && (
            <p className={muted}>{series.credit}</p>
          )}
          <p className={`${muted} from block`}>
            From {series.label},{" "}
            <a href={tableHref(series)}>{versionName(version)}</a>.
          </p>
        </div>
      ))}
      {read.coming === true && engine !== "failed" && (
        <Pending lines={2} said="Reading what the tables say of it…" />
      )}
    </>
  );
}

/** The entry `id` of the pod's `answers`, named by the tables; `own` where they name nothing. */
async function namedEntry(
  api: PodApi,
  pod: string,
  id: string,
  answers: Answers,
  own: Entry,
): Promise<Entry> {
  const { about, said, held } = maps(await api.said({ pod })) as {
    about?: Abouts;
    said?: VariantsSaid;
    held?: readonly Series[];
  };
  return entryOf(answers, id, { about, said, held }) ?? own;
}

/** The entry with all the tables say of it, its panels among it; the `named` entry alone where they say no more. */
async function fullEntry(
  api: PodApi,
  pod: string,
  id: string,
  named: Entry,
): Promise<EntryRead> {
  try {
    const full = maps(await api.said({ pod, entry: id })) as {
      entry?: Entry;
      panels?: Panels;
    };
    return { entry: full.entry ?? named, panels: full.panels ?? [] };
  } catch {
    return { entry: named, panels: [] };
  }
}

/**
 * What an entry's loader read: the entry now, with `named` the same named by the tables once they can say, and with
 * `full` all they say of it, its panels among it.
 */
interface EntryAsked {
  readonly pod: string;
  readonly read: EntryRead;
  readonly named?: Promise<EntryRead>;
  readonly full?: Promise<EntryRead>;
}

/** Reads the entry the address names, from the pod's answers, then what the tables say of it once the engine can. */
export const entryLoader = (api: PodApi) =>
  screen<EntryAsked>(async ({ params }: LoaderFunctionArgs) => {
    const pod = params.pod ?? "";
    const id = params.id ?? "";
    const { answers } = await api.answers({ pod });
    const own = entryOf(answers, id);
    const unnamed = { entry: own, panels: [] };
    if (own === undefined)
      return { value: { pod, read: unnamed }, title: "Not found" };
    const named = whenNamed(
      () => namedEntry(api, pod, id, answers, own),
      undefined,
    );
    const full = async (entry: Entry | undefined): Promise<EntryRead> =>
      entry === undefined ? unnamed : fullEntry(api, pod, id, entry);
    if (warming())
      return {
        value: {
          pod,
          read: unnamed,
          named: named.then((entry) => ({ entry: entry ?? own, panels: [] })),
          full: named.then(full),
        } satisfies EntryAsked,
        title: own.name,
      };
    const entry = await named;
    return {
      value: {
        pod,
        read: { entry: entry ?? own, panels: [] },
        ...(entry !== undefined && { full: full(entry) }),
      } satisfies EntryAsked,
      title: (entry ?? own).name,
    };
  });

export function EntryScreen() {
  const { pod, read, named, full } = useRead<EntryAsked>();
  const { titles, held } = useApp();
  const tables = useLate(held);
  const nameNow = useLate(named ?? read);
  const fullNow = useLate(full ?? read);
  return (
    <EntryPage
      pod={pod}
      titles={titles}
      read={{
        ...(fullNow ?? nameNow ?? read),
        coming: fullNow === undefined,
      }}
      held={tables?.held ?? []}
      engine="ready"
    />
  );
}
