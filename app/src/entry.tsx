// An entry's page, as a person reads it: its name and tags, what it is, where it came from and what else is known, each
// part absent when it has nothing to say but where it came from. It is drawn from the pod's answers first; once the
// engine is ready the tables add the codes' names, the LOINC panels a lab result is in and the versions that joined it.
import { Fragment } from "react";
import { useLocation, useParams } from "react-router";
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
  type Entry,
  type Series,
  type VariantsSaid,
  versionName,
} from "../said.ts";
import { useAddress } from "./address.tsx";
import { AskButton } from "./ask.tsx";
import { failed } from "./doing.ts";
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
import { Back, NotFound, sourceOf, useLoaded, Wrong } from "./screen.tsx";
import type { TablesHeld } from "./shell.tsx";

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

/** The entry the address names, from the pod's answers, then with what the tables say of it once the engine can say. */
export function EntryScreen({
  titles,
  held,
  engine,
}: {
  titles: ReadonlyMap<string, string>;
  held: TablesHeld;
  engine: "waiting" | "ready" | "failed";
}) {
  const { pod = "", id = "" } = useParams();
  const { pathname, search } = useLocation();
  const loaded = useLoaded<EntryRead>(
    pathname + search,
    async (api, later) => {
      const { answers } = await api.answers({ pod });
      const own = entryOf(answers, id);
      if (own === undefined || engine !== "ready")
        return {
          entry: own,
          panels: [],
          coming: own !== undefined && engine === "waiting",
        };
      const { about, said, held } = maps(await api.said({ pod })) as {
        about?: Abouts;
        said?: VariantsSaid;
        held?: readonly Series[];
      };
      const named = entryOf(answers, id, { about, said, held }) ?? own;
      const here = location.pathname + location.search;
      api.said({ pod, entry: id }).then(
        (sent) => {
          const full = maps(sent) as { entry?: Entry; panels?: Panels };
          later({ entry: full.entry ?? named, panels: full.panels ?? [] });
        },
        (error: unknown) => {
          if (location.pathname + location.search !== here) return;
          if (error instanceof Error && error.name === "Refusal")
            later({ entry: named, panels: [] });
          else
            failed(
              `the entry's tables could not be read: ${error instanceof Error ? error.message : String(error)}`,
            );
        },
      );
      return { entry: named, panels: [], coming: true };
    },
    ({ entry }) => entry?.name ?? "Not found",
    engine,
  );
  if (loaded === undefined) return null;
  if ("wrong" in loaded) return <Wrong said={loaded.wrong} />;
  if ("refused" in loaded) return <NotFound said={loaded.refused} />;
  return (
    <EntryPage
      pod={pod}
      titles={titles}
      read={loaded.value}
      held={held.held}
      engine={engine}
    />
  );
}
