// The trend of one test, a medication marked: a chart of the results with the days the medication started and stopped
// dashed across it, each medication as a bar under it, a table of the results and links to pick another test or
// medication. It states what changed after what, never why.
import { useLocation, useParams, useSearchParams } from "react-router";
import {
  type Abouts,
  type Coded,
  day,
  dayAt,
  LARGE,
  type Left,
  leftSaid,
  maps,
  plotOf,
  type Row,
  resultsSaid,
  rounded,
  testsIn,
  therapiesOf,
  timeOf,
  type Timed,
  trendTitle,
  unitOf,
} from "../said.ts";
import { useAddress } from "./address.tsx";
import { AskButton } from "./ask.tsx";
import { Chart, Lane } from "./chart.tsx";
import { Back, NotFound, useLoaded, Wrong } from "./screen.tsx";

/** A test's results in a pod, as `labSeriesIn` gives them. */
interface LabSeries {
  readonly test: Coded & { readonly code: string };
  readonly results: readonly {
    readonly date: string;
    readonly value: number;
    readonly unit: string;
  }[];
  readonly left: Left;
}

/** What a trend is drawn from: PodApi's `trend`, with its names for the codes as a `Map` once the tables can say. */
interface TrendRead {
  readonly labs: readonly Row[];
  readonly timeline: readonly Timed[];
  readonly series: LabSeries;
  readonly medication?: string;
  readonly about?: Abouts;
}

export function TrendPage({
  pod,
  titles,
  read,
}: {
  pod: string;
  titles: ReadonlyMap<string, string>;
  read: TrendRead;
}) {
  const address = useAddress();
  const { labs, series, timeline, medication, about = new Map() } = read;
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
  const marks = [
    ...(chosen?.started
      ? [
          {
            time: timeOf(chosen.started),
            kind: "start",
            text: `${chosen.name} started`,
          },
        ]
      : []),
    ...(chosen?.ended
      ? [
          {
            time: timeOf(chosen.ended),
            kind: "stop",
            text: `${chosen.name} stopped`,
          },
        ]
      : []),
  ];
  const tested = series.test.notation ?? series.test.code;
  const link = (given: { test?: string; medication?: string }) =>
    address.trend(pod, {
      test: tested,
      ...(chosen ? { medication: chosen.key } : {}),
      ...given,
    });
  const left = leftSaid(series.left);
  const unplotted = series.results.length - drawn.length;
  const times = points.map(({ time }) => time);
  const values = points.map(({ value }) => value);
  const plot = plotOf({ points, marks, size: LARGE });
  return (
    <>
      <Back pod={pod} titles={titles} />
      <h1>{name}</h1>
      <p className="lead">
        {series.results.length === 0
          ? "No result of this test is a number."
          : `${resultsSaid(series.results.length)}${unit === "" ? "" : `, in ${unit}`}`}
        <AskButton
          about={{
            kind: "trend",
            test: tested,
            ...(chosen ? { medication: chosen.key } : {}),
          }}
          label={chosen ? `${name} and ${chosen.name}` : name}
        />
      </p>
      {medication !== undefined && chosen === undefined && (
        <p className="note">This pod holds no medication {medication}.</p>
      )}
      {points.length > 0 && (
        <div className="card trend">
          <Chart
            id="trend-chart"
            plot={plot}
            points={points}
            marks={marks}
            unit={unit}
            title={name}
            desc={`${resultsSaid(points.length)} from ${dayAt(Math.min(...times))} to ${dayAt(Math.max(...times))}, from ${rounded(Math.min(...values))} to ${rounded(Math.max(...values))} ${unit}.${marks.map(({ time, text }) => ` ${text} ${dayAt(time)}.`).join("")}`}
            axes
          />
          <Lane
            id="trend-lane"
            plot={plot}
            drugs={drugs}
            chosen={chosen}
            title="Medications"
            desc={
              drugs.length === 0
                ? "No medication."
                : drugs
                    .map(
                      (drug) =>
                        `${drug.name}${drug.started ? ` from ${dayAt(timeOf(drug.started))}` : ", start not known"}${drug.ended ? ` to ${dayAt(timeOf(drug.ended))}` : ", not stopped"}.`,
                    )
                    .join(" ")
            }
          />
          {unplotted > 0 && (
            <p className="muted">
              The chart leaves out {resultsSaid(unplotted)} in another unit; the
              table lists {unplotted === 1 ? "it" : "them"}.
            </p>
          )}
        </div>
      )}
      <div className="card">
        <h2>Results</h2>
        {left !== undefined && <p className="muted">{left}</p>}
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Value</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {series.results.map((result, at) => (
                <tr key={at}>
                  <td>{day(result.date)}</td>
                  <td>{rounded(result.value)}</td>
                  <td>{result.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card picker">
        <h2>Show</h2>
        <h3>Test</h3>
        <ul>
          {testsIn(labs).map((each) => {
            const code = each.notation ?? each.code;
            return (
              <li key={each.code}>
                <a
                  href={link({ test: code })}
                  aria-current={code === tested ? "true" : undefined}
                >
                  {each.name ?? code}
                </a>
              </li>
            );
          })}
        </ul>
        <h3>Medication marked</h3>
        <ul>
          <li>
            <a
              href={address.trend(pod, { test: tested })}
              aria-current={chosen === undefined ? "true" : undefined}
            >
              None
            </a>
          </li>
          {drugs.map((drug) => (
            <li key={drug.key}>
              <a
                href={link({ medication: drug.key })}
                aria-current={drug === chosen ? "true" : undefined}
              >
                {drug.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** The trend the address asks for: with no test the strongest change's, else the pod's first. */
export function TrendScreen({
  titles,
  engine,
}: {
  titles: ReadonlyMap<string, string>;
  engine: "waiting" | "ready" | "failed";
}) {
  const { pod = "" } = useParams();
  const { pathname, search } = useLocation();
  const [asked] = useSearchParams();
  const test = asked.get("test") || undefined;
  const medication = asked.get("medication") || undefined;
  const loaded = useLoaded<TrendRead>(
    pathname + search,
    async (api) =>
      maps(
        await api.trend({
          pod,
          ...(test !== undefined && { test }),
          ...(medication !== undefined && { medication }),
          named: engine === "ready",
        }),
      ) as unknown as TrendRead,
    ({ series, about }) => trendTitle(series, about),
    engine === "ready",
  );
  if (loaded === undefined) return null;
  if ("wrong" in loaded) return <Wrong said={loaded.wrong} />;
  if ("refused" in loaded) return <NotFound said={loaded.refused} />;
  return <TrendPage pod={pod} titles={titles} read={loaded.value} />;
}
