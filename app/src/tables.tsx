// The reference tables: a source's page and a table's, which search their codes, and a code's page, which says what
// every table the app holds says of it and where from.
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useLocation, useParams } from "react-router";
import {
  freshness,
  LICENCES,
  pageNumber,
  personName,
  relationName,
  REQUIRED,
  rowSaid,
  sourcesOf,
  statusOf,
  tableId,
  versionName,
  type About,
  type ClassificationRow,
  type Series,
  type Source,
} from "../said.ts";
import { ROUTED, useAddress, useGeneration } from "./address.tsx";
import { Notice, useActions } from "./actions.tsx";
import { isRefusal, useHost } from "./api.tsx";
import { ready } from "./doing.ts";
import {
  bullet,
  bullets,
  card,
  factName,
  facts as factsLook,
  factValue,
  lead,
  muted,
  row as rowLook,
  tag,
} from "./look.ts";

/** A code as the tables say it: its notation and what they name it. */
export interface CodeSaid {
  readonly code: string;
  readonly notation: string;
  readonly about?: About;
}

/** A code a search found, with the codes it maps to. */
interface Found extends CodeSaid {
  readonly mapsTo: readonly CodeSaid[];
}

/** What a search found: page `offset` of `total` codes, `size` to a page. */
interface Searched {
  readonly total: number;
  readonly offset?: number;
  readonly size: number;
  readonly found: readonly Found[];
}

/** Where a fact of a code's page came from: a table the app holds, and its version. */
interface FromVersion {
  readonly series: string;
  readonly version: string;
}

/** Some of a code's codes, and how many there are in all. */
interface Several {
  readonly total: number;
  readonly codes: readonly CodeSaid[];
}

interface Placed extends CodeSaid {
  readonly required?: string;
}

/** Everything the tables say of one code. */
interface Facts {
  readonly notation: string;
  readonly about?: About;
  readonly page?: { readonly href: string; readonly system: string };
  readonly names: readonly (FromVersion & {
    readonly label: string;
    readonly altLabels: readonly string[];
  })[];
  readonly status: readonly (FromVersion & {
    readonly deprecated: boolean;
    readonly replacedBy: readonly CodeSaid[];
  })[];
  readonly mappings: readonly (FromVersion & {
    readonly mapsTo: readonly (CodeSaid & { readonly alongside: Several })[];
    readonly mappedFrom: Several;
  })[];
  readonly classifications?: readonly (ClassificationRow & FromVersion)[];
  readonly panels?: readonly (FromVersion & {
    readonly members: readonly Placed[];
    readonly heldBy: {
      readonly total: number;
      readonly panels: readonly Placed[];
    };
  })[];
  readonly classes?: readonly (FromVersion & {
    readonly in: readonly {
      readonly relation: string;
      readonly class: CodeSaid;
      readonly through?: CodeSaid;
    }[];
    readonly withheld?: readonly {
      readonly relation: string;
      readonly ingredient: CodeSaid;
    }[];
  })[];
}

/** What the `table` operation answers: the tables held, and the source, table, search or code the address asked for. */
export interface TableRead {
  readonly held: readonly Series[];
  readonly source?: Source;
  readonly series?: Series;
  readonly searched?: Searched;
  readonly uses?: Readonly<Record<string, readonly string[]>>;
  readonly facts?: Facts;
}

/** The source the address names by `id`, a source's or one of its tables'; the first source with none. */
export function currentSource(
  held: readonly Series[],
  id: string | undefined,
): Source | undefined {
  const sources = sourcesOf(held);
  return id === undefined
    ? sources[0]
    : sources.find(
        (each) =>
          tableId(each.iri) === id ||
          each.series.some((series) => tableId(series.iri) === id),
      );
}

/** `text`, a link to `iri` when a feed gave a web address, never another scheme. */
const linked = (iri: string, text: string): ReactNode =>
  /^https?:\/\//.test(iri) ? <a href={iri}>{text}</a> : text;

/** Who publishes `series`, the credit it asks for, its licence and how fresh it is at `now`, as a card headed `heading`. */
function Published({
  series,
  now,
  heading,
}: {
  series: Series;
  now: number;
  heading?: string | false;
}) {
  return (
    <div className={card}>
      {heading && <h2>{heading}</h2>}
      <dl className={factsLook}>
        <dt className={factName}>Source</dt>
        <dd className={factValue}>
          {series.publisher !== undefined &&
            linked(
              series.publisher,
              series.publisherName ??
                series.publisher.replace(/^[a-z]+:\/\/([^/]+).*$/, "$1"),
            )}
          {series.credit !== undefined && (
            <>
              {" "}
              <span className={muted}>{series.credit}</span>
            </>
          )}
        </dd>
        <dt className={factName}>Licence</dt>
        <dd className={factValue}>
          {series.licence === undefined
            ? "Not stated"
            : linked(
                series.licence,
                LICENCES[series.licence] ?? series.licence,
              )}
        </dd>
        <dt className={factName}>Fresh</dt>
        <dd className={factValue}>{freshness(series, now)}</dd>
      </dl>
    </div>
  );
}

/** A search box for the table or source `id` (the first source with none), with `text` in it. */
function SearchBox({ id, text }: { id?: string; text: string }) {
  const address = useAddress();
  const { act } = useActions();
  return (
    <form
      method="get"
      action={address.table(id)}
      className={`${rowLook} ${card}`}
      data-doing="Searching…"
      onSubmit={(event) => {
        event.preventDefault();
        const q = String(new FormData(event.currentTarget).get("q") ?? "");
        act(async (go) => go(ROUTED.table(id, { q })), "Searching…");
      }}
    >
      <input
        className="min-w-40 flex-1"
        key={text}
        name="q"
        defaultValue={text}
        placeholder="Search by code or name"
        aria-label="Search by code or name"
      />
      <button>Search</button>
    </form>
  );
}

const counted = (count: number) =>
  `${count.toLocaleString("en")} ${count === 1 ? "code" : "codes"}`;

/**
 * The codes `searched` found, page `page` of them, as a table headed `heads` with a row of cells `row(found)` each,
 * and links to the pages before and after it at `pageHref(page)`.
 */
function CodesFound({
  searched,
  page,
  pageHref,
  heads,
  row,
}: {
  searched: Searched;
  page: number;
  pageHref: (page: number) => string;
  heads: readonly string[];
  row: (found: Found) => ReactNode;
}) {
  const { found, total, offset = 0, size } = searched;
  if (total === 0) return <p className={muted}>No code matches.</p>;
  const shown =
    found.length === 0
      ? `None on page ${page} of ${counted(total)}.`
      : offset === 0 && found.length === total
        ? `${counted(total)}.`
        : `${(offset + 1).toLocaleString("en")}–${(offset + found.length).toLocaleString("en")} of ${counted(total)}.`;
  // A page past the last steps back to the last.
  const previous =
    found.length === 0 ? Math.max(1, Math.ceil(total / size)) : page - 1;
  const before = offset > 0;
  const after = offset + found.length < total;
  return (
    <>
      <p className={muted}>{shown}</p>
      {found.length > 0 && (
        <div className="scroll max-h-[60vh] overflow-auto pr-3">
          <table className="codes">
            <thead>
              <tr>
                {heads.map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {found.map((each) => (
                <tr key={each.code}>{row(each)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(before || after) && (
        <p className="pages mt-[0.6rem] mb-5 flex gap-4">
          {before && (
            <a href={pageHref(previous)} rel="prev">
              Previous
            </a>
          )}
          {after && (
            <a href={pageHref(page + 1)} rel="next">
              Next
            </a>
          )}
        </p>
      )}
    </>
  );
}

/** A code's name, with its other names after it. */
function NamesOf({ about }: { about: About | undefined }) {
  const others = about?.name?.altLabels ?? [];
  return (
    <>
      {about?.name?.label}
      {others.length > 0 && (
        <>
          {" "}
          <span className={muted}>{others.join("; ")}</span>
        </>
      )}
    </>
  );
}

/** What a page says when the app holds no reference table. */
function NoTables() {
  return (
    <>
      <h1>No reference tables yet</h1>
      <p className={lead}>
        Reference tables name codes and join records that say the same thing
        differently. This app keeps the ones its feeds publish; Check now reads
        them.
      </p>
    </>
  );
}

/**
 * A reference table's page: its source, licence, version and how fresh it is at `now`; a search box with `text` in it;
 * the codes `searched` found, page `page` of them, each a link to its page in `source`; and each version held with the
 * pods among `pods` that `uses` says were opened with it.
 */
export function TablePage({
  series,
  source,
  searched,
  text,
  page,
  uses,
  pods,
  titles,
  now,
}: {
  series: Series;
  source: Source;
  searched: Searched;
  text: string;
  page: number;
  uses: Readonly<Record<string, readonly string[]>>;
  pods: readonly string[];
  titles: ReadonlyMap<string, string>;
  now: number;
}) {
  const address = useAddress();
  const id = tableId(series.iri);
  const maps = searched.found.some((each) => each.mapsTo.length > 0);
  const named = ({ notation, about }: CodeSaid) =>
    about?.name === undefined ? notation : `${notation} ${about.name.label}`;
  return (
    <>
      <h1>{series.label}</h1>
      <p className={lead}>Using {versionName(series.current)}</p>
      <Published series={series} now={now} />
      <SearchBox id={id} text={text} />
      <CodesFound
        searched={searched}
        page={page}
        pageHref={(each) => address.table(id, { q: text, page: each })}
        heads={["Code", "Name", "Status", ...(maps ? ["Maps to"] : [])]}
        row={({ notation, about, mapsTo }) => (
          <>
            <td>
              <a href={address.table(tableId(source.iri), { code: notation })}>
                {notation}
              </a>
            </td>
            <td>
              <NamesOf about={about} />
            </td>
            <td>{statusOf(about)}</td>
            {maps && <td>{mapsTo.map(named).join(", ")}</td>}
          </>
        )}
      />
      <div className={`${card} versions`}>
        <h2>Which pods use which version</h2>
        <ul className={bullets}>
          {series.versions.map((version) => {
            const using = (uses[version.iri] ?? []).filter((pod) =>
              pods.includes(pod),
            );
            return (
              <li className={bullet} key={version.iri}>
                <strong>{versionName(version)}</strong>
                {version.iri === series.current.iri && (
                  <>
                    {" "}
                    <span className={tag}>current</span>
                  </>
                )}
                {": "}
                {using.length === 0 ? (
                  <span className={muted}>no pod</span>
                ) : (
                  using.map((pod, index) => (
                    <Fragment key={pod}>
                      {index > 0 && ", "}
                      <a href={address.pod(pod)}>{personName(pod, titles)}</a>
                    </Fragment>
                  ))
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

/**
 * A source's page: who publishes it, its licence and how fresh it is at `now`, a card for each set of its tables these
 * differ for, headed with their labels when there are several; a search box over the codes of all its tables; the
 * codes `searched` found, page `page` of them; and what the source publishes, each table a link.
 */
export function SourcePage({
  source,
  searched,
  text,
  page,
  now,
}: {
  source: Source;
  searched: Searched;
  text: string;
  page: number;
  now: number;
}) {
  const address = useAddress();
  const id = tableId(source.iri);
  const alike = new Map<string, Series[]>();
  for (const series of source.series) {
    const said = JSON.stringify([
      series.publisher,
      series.credit,
      series.licence,
      freshness(series, now),
    ]);
    alike.set(said, [...(alike.get(said) ?? []), series]);
  }
  const cards = [...alike.entries()];
  return (
    <>
      <h1>{source.label}</h1>
      {cards.map(([said, series]) => (
        <Published
          key={said}
          series={series[0]!}
          now={now}
          heading={
            cards.length > 1 && series.map(({ label }) => label).join(", ")
          }
        />
      ))}
      <SearchBox id={id} text={text} />
      <CodesFound
        searched={searched}
        page={page}
        pageHref={(each) => address.table(id, { q: text, page: each })}
        heads={["Code", "Name", "Status"]}
        row={({ notation, about }) => (
          <>
            <td>
              <a href={address.table(id, { code: notation })}>{notation}</a>
            </td>
            <td>
              <NamesOf about={about} />
            </td>
            <td>{statusOf(about)}</td>
          </>
        )}
      />
      <div className={`${card} versions`}>
        <h2>What this source publishes</h2>
        <ul className={bullets}>
          {source.series.map((series) => (
            <li className={bullet} key={series.iri}>
              <a href={address.table(tableId(series.iri))}>{series.label}</a>
              {": "}
              {versionName(series.current)}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** A code's page: everything `facts` says of it, each fact naming the table among `held` and the version it came from. */
export function CodePage({
  source,
  held,
  facts,
}: {
  source: Source;
  held: readonly Series[];
  facts: Facts;
}) {
  const address = useAddress();
  const sourceId = tableId(source.iri);
  const codeHref = (notation: string) =>
    address.table(sourceId, { code: notation });
  const tableOf = (series: string) => held.find(({ iri }) => iri === series);
  const from = ({ series, version }: FromVersion) => {
    const table = tableOf(series);
    const found = table?.versions.find(({ iri }) => iri === version);
    return (
      <p className={muted}>
        From {table?.label ?? series},{" "}
        {found === undefined ? version : versionName(found)}.
      </p>
    );
  };
  const code = ({ notation, about }: CodeSaid) => (
    <>
      <a href={codeHref(notation)}>{notation}</a>
      {about?.name !== undefined && ` ${about.name.label}`}
    </>
  );
  const several = ({ total, codes: shown }: Several) => (
    <>
      {shown.map((each, index) => (
        <Fragment key={each.code}>
          {index > 0 && ", "}
          {code(each)}
        </Fragment>
      ))}
      {total > shown.length &&
        ` and ${(total - shown.length).toLocaleString("en")} more`}
    </>
  );
  const credit = (series: string) => {
    const table = tableOf(series);
    return (
      table?.credit !== undefined && <p className={muted}>{table.credit}</p>
    );
  };
  const placed = (each: Placed) => (
    <li key={each.code}>
      {code(each)}
      {each.required !== undefined && (
        <>
          {" "}
          <span className={muted}>
            {REQUIRED[each.required] ?? each.required}
          </span>
        </>
      )}
    </li>
  );
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
  return (
    <>
      <p>
        <a href={address.table(sourceId)}>{source.label}</a>
      </p>
      <h1>
        {notation}
        {about?.name !== undefined && ` ${about.name.label}`}
      </h1>
      {page !== undefined && (
        <p>
          <a href={page.href} rel="external">
            {page.system}'s page for {notation}
          </a>
        </p>
      )}
      {names.map((name) => (
        <div className={card} key={`${name.series} ${name.version}`}>
          <h2>Names</h2>
          <p>
            <strong>{name.label}</strong>
          </p>
          {name.altLabels.length > 0 && (
            <ul>
              {name.altLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          )}
          {from(name)}
        </div>
      ))}
      {status.map((said) => (
        <div className={card} key={`${said.series} ${said.version}`}>
          <h2>Status</h2>
          <p>
            {said.deprecated ? "Retired" : "In use"}
            {said.replacedBy.length > 0 && (
              <>
                , replaced by{" "}
                {said.replacedBy.map((each, index) => (
                  <Fragment key={each.code}>
                    {index > 0 && ", "}
                    {code(each)}
                  </Fragment>
                ))}
              </>
            )}
            .
          </p>
          {from(said)}
        </div>
      ))}
      {mappings.map((mapping) => (
        <div className={card} key={`${mapping.series} ${mapping.version}`}>
          <h2>{tableOf(mapping.series)?.label ?? mapping.series}</h2>
          {mapping.mapsTo.map((target) => (
            <p key={target.code}>
              Maps to {code(target)}
              {target.alongside.total > 0 && (
                <>, as do {several(target.alongside)}</>
              )}
              .
            </p>
          ))}
          {mapping.mappedFrom.total > 0 && (
            <p>Mapped to it: {several(mapping.mappedFrom)}.</p>
          )}
          {from(mapping)}
        </div>
      ))}
      {classifications.map((row) => (
        <div className={card} key={`${row.series} ${row.version}`}>
          <h2>{tableOf(row.series)?.label ?? row.series}</h2>
          <p>{rowSaid(row)}</p>
          {credit(row.series)}
          {from(row)}
        </div>
      ))}
      {panels.map((panel) => (
        <div className={card} key={`${panel.series} ${panel.version}`}>
          <h2>{tableOf(panel.series)?.label ?? panel.series}</h2>
          {panel.members.length > 0 && (
            <>
              <p>
                A panel of{" "}
                {panel.members.length === 1
                  ? "one member"
                  : `${panel.members.length} members`}
                , in order:
              </p>
              <ol className="members">{panel.members.map(placed)}</ol>
            </>
          )}
          {panel.heldBy.total > 0 && (
            <>
              <p>
                {panel.members.length > 0 ? "Itself a member" : "A member"} of{" "}
                {panel.heldBy.total === 1
                  ? "one panel"
                  : `${panel.heldBy.total.toLocaleString("en")} panels`}
                :
              </p>
              <ul className="members">{panel.heldBy.panels.map(placed)}</ul>
              {panel.heldBy.total > panel.heldBy.panels.length && (
                <p className={muted}>
                  and{" "}
                  {(
                    panel.heldBy.total - panel.heldBy.panels.length
                  ).toLocaleString("en")}{" "}
                  more.
                </p>
              )}
            </>
          )}
          {credit(panel.series)}
          {from(panel)}
        </div>
      ))}
      {classes.map((classed) => (
        <div className={card} key={`${classed.series} ${classed.version}`}>
          <h2>{tableOf(classed.series)?.label ?? classed.series}</h2>
          {classed.in.length > 0 && (
            <ul className="members">
              {classed.in.map((each) => (
                <li key={`${each.relation} ${each.class.code}`}>
                  <strong>{relationName(each.relation)}:</strong>{" "}
                  {code(each.class)}
                  {each.through !== undefined && (
                    <>
                      {" "}
                      <span className={muted}>
                        through {code(each.through)}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(classed.withheld ?? []).map((each) => (
            <p key={`${each.relation} ${each.ingredient.code}`}>
              No {(relationName(each.relation) ?? "").toLowerCase()} is given:
              FDA classes a different form of {code(each.ingredient)}; RxNorm
              does not tie this drug to it.
            </p>
          ))}
          {credit(classed.series)}
          {from(classed)}
        </div>
      ))}
      {names.length +
        status.length +
        mappings.length +
        classifications.length +
        panels.length +
        classes.length ===
        0 && (
        <p className={muted}>
          No table this app holds says anything of this code.
        </p>
      )}
    </>
  );
}

type Body = { readonly at: string } & (
  | { readonly read: TableRead }
  | { readonly refused: string }
  | { readonly wrong: string }
);

/** What was read for an address, and how many times a read has been drawn, so that each is said ready. */
type Shown = Body & { readonly drawn: number };

/** What the title of the page is for what was read: the table, source or code asked for. */
function titleOf(shown: Shown): string {
  if ("refused" in shown) return "Not found";
  if ("wrong" in shown) return "Something went wrong";
  const { source, series, facts } = shown.read;
  if (source === undefined) return "Reference tables";
  if (series !== undefined) return series.label;
  if (facts !== undefined)
    return `${facts.notation} ${facts.about?.name?.label ?? ""}`.trim();
  return source.label;
}

/**
 * The table, source or code the address names: `/tables/<id>/` with `q` and `page` for a search of it, or `code` for
 * that code's page; with no id, the first source the app holds.
 */
export function TableScreen({
  pods,
  titles,
}: {
  pods: readonly string[];
  titles: ReadonlyMap<string, string>;
}) {
  const { api } = useHost();
  const { heldNow } = useActions();
  const { id } = useParams();
  const { pathname, search } = useLocation();
  const generation = useGeneration();
  const at = pathname + search;
  const [shown, setShown] = useState<Shown>();
  useEffect(() => {
    let live = true;
    const query = new URLSearchParams(search);
    const asked = {
      ...(id !== undefined && { id }),
      q: query.get("q") ?? "",
      page: pageNumber(query.get("page")),
      ...(query.has("code") && { code: query.get("code") ?? "" }),
    };
    const show = (body: Body) =>
      live && setShown((now) => ({ ...body, drawn: (now?.drawn ?? 0) + 1 }));
    api.table(asked).then(
      (read) => {
        if (!live) return;
        heldNow(read.held);
        show({ at, read });
      },
      (error: unknown) =>
        show(
          isRefusal(error) && error.name === "Refusal"
            ? { at, refused: error.message }
            : {
                at,
                wrong: error instanceof Error ? error.message : String(error),
              },
        ),
    );
    return () => {
      live = false;
    };
  }, [api, heldNow, id, at, search, generation]);
  useEffect(() => {
    if (shown === undefined || shown.at !== at) return;
    document.title = `${titleOf(shown)} · Cascade`;
    if ("read" in shown) ready();
  }, [shown, at]);
  if (shown === undefined) return null;
  if ("refused" in shown)
    return (
      <Notice heading="Not found" drawn={shown.drawn}>
        {shown.refused}
      </Notice>
    );
  if ("wrong" in shown)
    return (
      <Notice heading="Something went wrong" wrong drawn={shown.drawn}>
        {shown.wrong}
      </Notice>
    );
  const { source, series, searched, uses, facts, held } = shown.read;
  const query = new URLSearchParams(search);
  const text = query.get("q") ?? "";
  const page = pageNumber(query.get("page"));
  const now = Date.now();
  if (source === undefined) return <NoTables />;
  if (series !== undefined && searched !== undefined)
    return (
      <TablePage
        series={series}
        source={source}
        searched={searched}
        text={text}
        page={page}
        uses={uses ?? {}}
        pods={pods}
        titles={titles}
        now={now}
      />
    );
  if (facts !== undefined)
    return <CodePage source={source} held={held} facts={facts} />;
  if (searched === undefined) return <NoTables />;
  return (
    <SourcePage
      source={source}
      searched={searched}
      text={text}
      page={page}
      now={now}
    />
  );
}
