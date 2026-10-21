// A pod's results in one LOINC panel: each test the panel lists in LOINC's order with whether it is required and the
// pod's results of it, newest first, a nested panel's tests under it, which required tests the pod has no result for,
// and which version of the tables says so. It never says a result was drawn as part of the panel: only that LOINC
// lists the test in it.
import type { LoaderFunctionArgs } from "react-router";
import {
  type Abouts,
  compare,
  day,
  heldAt,
  listed,
  maps,
  notationOf,
  REQUIRED,
  type Row,
  type Series,
  sourcesOf,
  tableId,
  versionName,
} from "../said.ts";
import { useAddress } from "./address.tsx";
import type { PodApi } from "./api.tsx";
import { card, lead, muted, tagWarm } from "./look.ts";
import { Back, screen, sourceOf, useApp, useRead } from "./screen.tsx";

/** What the page is drawn from: PodApi's `panel`, its pairs as `Map`s again. */
interface PanelRead {
  readonly panel: string;
  readonly rows: readonly Row[];
  readonly labs: readonly Row[];
  readonly panelAbout?: Abouts;
  readonly held?: readonly Series[];
}

interface Line {
  readonly member: string;
  readonly via: string;
  readonly sequence: number;
  readonly required: string | undefined;
  readonly results: Row[];
}

export function PanelPage({
  pod,
  titles,
  read,
}: {
  pod: string;
  titles: ReadonlyMap<string, string>;
  read: PanelRead;
}) {
  const address = useAddress();
  const { panel, rows, labs, panelAbout: about = new Map(), held = [] } = read;
  const nameOf = (code: string) =>
    about.get(code)?.name?.label ??
    about.get(code)?.notation ??
    notationOf(code) ??
    code;
  const results = new Map(labs.map((row) => [row.entry, row]));
  const lines = new Map<string, Line>();
  for (const row of rows) {
    const key = `${row.via} ${row.member}`;
    let line = lines.get(key);
    if (line === undefined) {
      line = {
        member: row.member ?? "",
        via: row.via ?? "",
        sequence: Number(row.sequence),
        required: row.required,
        results: [],
      };
      lines.set(key, line);
    }
    if (row.entry !== undefined)
      line.results.push(results.get(row.entry) ?? { entry: row.entry });
  }
  const byPlace = (a: Line, b: Line) =>
    a.sequence - b.sequence || nameOf(a.member).localeCompare(nameOf(b.member));
  const own = [...lines.values()].filter((line) => line.via === panel);
  const shownOwn = new Set(own.map((line) => line.member));
  const nested = new Map<string, Line[]>();
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
  const said =
    rows.length === 0
      ? "You have no results in this panel."
      : required.length === 0
        ? "LOINC requires none of this panel's tests."
        : missing.length === 0
          ? `You have ${required.length === 1 ? "the one required test" : `all ${required.length} required tests`}.`
          : `You have ${required.length - missing.length} of ${required.length} required test${required.length === 1 ? "" : "s"}; missing: ${listed(missing.map((line) => nameOf(line.member)))}.`;
  const requirement = (line: Line) =>
    line.required === undefined
      ? undefined
      : (REQUIRED[line.required] ?? line.required);
  const versions = [
    ...new Set(
      [
        ...rows.map((row) => row.origin),
        ...[...about.values()].map((each) => each?.name?.origin),
      ].filter((origin): origin is string => origin !== undefined),
    ),
  ].flatMap((origin) => heldAt(origin, held) ?? []);
  const naming = about.get(panel)?.name?.origin;
  const named = naming === undefined ? undefined : heldAt(naming, held);
  const source =
    named === undefined ? undefined : sourceOf(sourcesOf(held), named.series);
  const notation = about.get(panel)?.notation;
  return (
    <>
      <Back pod={pod} titles={titles} />
      <h1>Your results in {nameOf(panel)}</h1>
      <p className={lead}>{said}</p>
      {rows.length > 0 && (
        <p className={muted}>
          {source !== undefined && notation !== undefined ? (
            <>
              LOINC{" "}
              <a href={address.table(tableId(source.iri), { code: notation })}>
                {notation}
              </a>{" "}
              lists
            </>
          ) : (
            "LOINC lists"
          )}{" "}
          these tests in this panel; that does not say your results were drawn
          as part of it.
        </p>
      )}
      {groups.map((group) => (
        <div key={group.via} className={card}>
          <h2>
            {group.via === panel
              ? "Tests in the panel's order"
              : `Within ${nameOf(group.via)}`}
          </h2>
          <ol className="members">
            {group.lines.map((line) => (
              <li key={line.member}>
                <strong>{nameOf(line.member)}</strong>
                {requirement(line) !== undefined && (
                  <>
                    {" "}
                    <span className={muted}>{requirement(line)}</span>
                  </>
                )}
                {line.results.length === 0 ? (
                  <>
                    {" "}
                    <span className={tagWarm}>No result</span>
                  </>
                ) : (
                  <ul>
                    {[...line.results]
                      .sort((a, b) =>
                        compare("date", b.performed ?? "", a.performed ?? ""),
                      )
                      .map((result) => (
                        <li key={result.entry}>
                          <a href={address.entry(pod, result.entry ?? "")}>
                            {[result.value, result.unit]
                              .filter(Boolean)
                              .join(" ") || "Result"}
                          </a>
                          {result.performed !== undefined && (
                            <>
                              {" "}
                              <span className={muted}>
                                {day(result.performed)}
                              </span>
                            </>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {versions.length > 0 && (
        <p className={`${muted} from`}>
          From{" "}
          {listed(
            versions.map(
              ({ series, version }) =>
                `${series.label}, ${versionName(version)}`,
            ),
          )}
          .
        </p>
      )}
      {[...new Set(versions.flatMap(({ series }) => series.credit ?? []))].map(
        (credit) => (
          <p key={credit} className={muted}>
            {credit}
          </p>
        ),
      )}
    </>
  );
}

/** Reads the pod's results in the LOINC panel the address's `panel` names. */
export const panelLoader = (api: PodApi) =>
  screen(async ({ params, request }: LoaderFunctionArgs) => {
    const pod = params.pod ?? "";
    const panel = new URL(request.url).searchParams.get("panel");
    const read = maps(
      await api.panel({ pod, ...(panel !== null && { panel }) }),
    ) as unknown as PanelRead;
    return {
      value: { pod, read },
      title: `Your results in ${read.panelAbout?.get(read.panel)?.name?.label ?? "a panel"}`,
    };
  });

export function PanelScreen() {
  const { pod, read } = useRead<{ pod: string; read: PanelRead }>();
  const { titles } = useApp();
  return <PanelPage pod={pod} titles={titles} read={read} />;
}
