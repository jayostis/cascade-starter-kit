// A pod's medicines by class: the active ones grouped under each class the tables give the drug, or one class alone when
// the address picks it, with the table and version each came from, its credit, and which medicines are in none and why.
import { useLocation, useParams, useSearchParams } from "react-router";
import {
  type Abouts,
  heldAt,
  listed,
  maps,
  notationOf,
  RELATIONS,
  relationName,
  type Row,
  type Series,
  sourcesOf,
  tableId,
  versionName,
} from "../said.ts";
import { useAddress } from "./address.tsx";
import { card, lead, muted, pickerLink, pickerList } from "./look.ts";
import { Back, NotFound, sourceOf, useLoaded, Wrong } from "./screen.tsx";

/** What the page is drawn from: PodApi's `classes`, its pairs as `Map`s again, and the series the app holds. */
interface ClassesRead {
  readonly rows: readonly Row[];
  readonly medications: readonly Row[];
  readonly classes?: Abouts;
  readonly elsewhere?: ReadonlyMap<string, readonly (string | undefined)[]>;
  readonly held?: readonly Series[];
}

interface Group {
  readonly relation: string;
  readonly class: string;
  readonly medicines: Map<
    string,
    { entry: string; name: string; through: Set<string> }
  >;
  readonly origins: Set<string>;
}

export function ClassesPage({
  pod,
  titles,
  read,
  picked,
}: {
  pod: string;
  titles: ReadonlyMap<string, string>;
  read: ClassesRead;
  picked: string | undefined;
}) {
  const address = useAddress();
  const {
    rows,
    medications,
    classes: about = new Map(),
    elsewhere = new Map(),
    held = [],
  } = read;
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = `${row.relation} ${row.class}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        relation: row.relation ?? "",
        class: row.class ?? "",
        medicines: new Map(),
        origins: new Set(),
      };
      groups.set(key, group);
    }
    const entry = row.entry ?? "";
    let medicine = group.medicines.get(entry);
    if (medicine === undefined) {
      medicine = {
        entry,
        name: row.medication ?? "",
        through: new Set(),
      };
      group.medicines.set(entry, medicine);
    }
    if (row.stated !== "true") medicine.through.add(row.through ?? "");
    group.origins.add(row.origin ?? "");
  }
  const nameOf = (code: string) =>
    about.get(code)?.name?.label ??
    about.get(code)?.notation ??
    notationOf(code) ??
    code;
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
  const left = medications.filter(({ entry }) => !inAClass.has(entry ?? ""));
  const formOf = left.filter(({ code }) => elsewhere.has(code ?? ""));
  const unclassed = left.filter(({ code }) => !elsewhere.has(code ?? ""));
  const sources = sourcesOf(held);
  const from = (group: Group) => {
    const versions = [...group.origins].flatMap((origin) => {
      const found = heldAt(origin, held);
      return found === undefined ? [] : [found];
    });
    return versions.length === 0 ? null : (
      <p className={muted}>
        From{" "}
        {listed(
          versions.map(
            ({ series, version }) => `${series.label}, ${versionName(version)}`,
          ),
        )}
        .
      </p>
    );
  };
  const link = (group: Group) => {
    const said = about.get(group.class);
    const found =
      said?.name?.origin === undefined
        ? undefined
        : heldAt(said.name.origin, held);
    const source =
      found === undefined ? undefined : sourceOf(sources, found.series);
    return source === undefined || said?.notation === undefined ? (
      nameOf(group.class)
    ) : (
      <a href={address.table(tableId(source.iri), { code: said.notation })}>
        {nameOf(group.class)}
      </a>
    );
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
  return (
    <>
      <Back pod={pod} titles={titles} />
      <h1>Medicines by class</h1>
      <p className={lead}>
        {classed.length === 0
          ? "None of this pod's active medicines is in a class the app's tables know."
          : "Which of the active medicines of this pod are in a class, by the classes MED-RT gives the drug."}
      </p>
      {classed.length > 0 && (
        <div className={`${card} picker`}>
          <h2>Pick a class</h2>
          <ul className={pickerList}>
            <li>
              <a
                className={pickerLink}
                href={address.classes(pod)}
                aria-current={picked === undefined ? "true" : undefined}
              >
                All classes
              </a>
            </li>
            {classed.map((group) => (
              <li key={`${group.relation} ${group.class}`}>
                <a
                  className={pickerLink}
                  href={address.classes(pod, group.class)}
                  aria-current={picked === group.class ? "true" : undefined}
                >
                  {nameOf(group.class)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {shown.map((group) => (
        <div key={`${group.relation} ${group.class}`} className={card}>
          <h2>{link(group)}</h2>
          <p className={muted}>{relationName(group.relation)}</p>
          <ul>
            {[...group.medicines.values()].map((medicine) => (
              <li key={medicine.entry}>
                <a href={address.entry(pod, medicine.entry)}>{medicine.name}</a>
                {medicine.through.size > 0 && (
                  <>
                    {" "}
                    <span className={muted}>
                      through {listed([...medicine.through].map(nameOf))}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {from(group)}
        </div>
      ))}
      {picked !== undefined && shown.length === 0 && (
        <p>None of this pod's active medicines is in that class.</p>
      )}
      {credits.map((credit) => (
        <p key={credit} className={muted}>
          {credit}
        </p>
      ))}
      {left.length > 0 && (
        <div className={card}>
          <h2>Not in a class here</h2>
          {formOf.map(({ entry, medication, code }) => (
            <p key={entry}>
              {medication}: FDA classes a different form of{" "}
              {listed((elsewhere.get(code ?? "") ?? []).map(String))}; RxNorm
              does not tie this product to it.
            </p>
          ))}
          {unclassed.length > 0 && (
            <p>
              {listed(unclassed.map(({ medication }) => medication ?? ""))}.
              MED-RT classes single ingredients, not the combination of several,
              and gives some single ingredients no class; a drug the tables do
              not map to an ingredient has no class here.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/** The pod's active medicines by class, or with the address's `class` that one alone. */
export function ClassesScreen({
  titles,
}: {
  titles: ReadonlyMap<string, string>;
}) {
  const { pod = "" } = useParams();
  const { pathname, search } = useLocation();
  const [asked] = useSearchParams();
  const loaded = useLoaded<ClassesRead>(
    pathname + search,
    async (api) => maps(await api.classes({ pod })) as unknown as ClassesRead,
    () => "Medicines by class",
  );
  if (loaded === undefined) return null;
  if ("wrong" in loaded) return <Wrong said={loaded.wrong} />;
  if ("refused" in loaded) return <NotFound said={loaded.refused} />;
  return (
    <ClassesPage
      pod={pod}
      titles={titles}
      read={loaded.value}
      picked={asked.get("class") ?? undefined}
    />
  );
}
