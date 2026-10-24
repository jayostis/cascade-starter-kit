// The trend of one test, a medication marked: a chart of the results with the days the medication was prescribed,
// started and stopped dashed across it, each medication as a bar under it, a table of the results and links to pick another test or
// medication. It states what changed after what, never why.
import type { LoaderFunctionArgs } from "react-router";
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
  therapyDays,
  therapySpan,
  timeOf,
  type Timed,
  trendTitle,
  unitOf,
} from "../said.ts";
import { useAddress } from "./address.tsx";
import type { PodApi } from "./api.tsx";
import { AskButton } from "./ask.tsx";
import { Chart, Lane } from "./chart.tsx";
import { warming, whenNamed } from "./engine.ts";
import {
  card,
  lead,
  muted,
  note,
  pickerHeading,
  pickerLink,
  pickerList,
} from "./look.ts";
import { Back, screen, useApp, useLate, useRead } from "./screen.tsx";

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

/**
 * The trend drawn from `read`; with `naming`, while the tables are still to name its test and medications, the parts
 * that name them are busy.
 */
export function TrendPage({
  pod,
  titles,
  read,
  naming = false,
}: {
  pod: string;
  titles: ReadonlyMap<string, string>;
  read: TrendRead;
  naming?: boolean;
}) {
  const busy = naming ? "true" : undefined;
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
  const marks = (chosen === undefined ? [] : therapyDays(chosen)).map(
    ({ kind, day: on, said }) => ({
      time: timeOf(on),
      kind,
      text: `${chosen!.name} ${said}`,
    }),
  );
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
      <h1 aria-busy={busy}>{name}</h1>
      <p className={lead}>
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
        <p className={note}>This pod holds no medication {medication}.</p>
      )}
      {points.length > 0 && (
        <div className={`${card} trend`} aria-busy={busy}>
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
                        `${drug.name}: ${therapySpan(drug, (on) => dayAt(timeOf(on)))}.`,
                    )
                    .join(" ")
            }
          />
          {unplotted > 0 && (
            <p className={muted}>
              The chart leaves out {resultsSaid(unplotted)} in another unit; the
              table lists {unplotted === 1 ? "it" : "them"}.
            </p>
          )}
        </div>
      )}
      <div className={card}>
        <h2>Results</h2>
        {left !== undefined && <p className={muted}>{left}</p>}
        <div className="scroll max-h-[60vh] overflow-auto pr-3">
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
      <div className={`${card} picker`} aria-busy={busy}>
        <h2>Show</h2>
        <h3 className={pickerHeading}>Test</h3>
        <ul className={pickerList}>
          {testsIn(labs).map((each) => {
            const code = each.notation ?? each.code;
            return (
              <li key={each.code}>
                <a
                  className={pickerLink}
                  href={link({ test: code })}
                  aria-current={code === tested ? "true" : undefined}
                >
                  {each.name ?? code}
                </a>
              </li>
            );
          })}
        </ul>
        <h3 className={pickerHeading}>Medication marked</h3>
        <ul className={pickerList}>
          <li>
            <a
              className={pickerLink}
              href={address.trend(pod, { test: tested })}
              aria-current={chosen === undefined ? "true" : undefined}
            >
              None
            </a>
          </li>
          {drugs.map((drug) => (
            <li key={drug.key}>
              <a
                className={pickerLink}
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

/** What a trend's loader read: the trend now, and with `named` the same named by the tables, once they can say. */
interface TrendAsked {
  readonly pod: string;
  readonly read: TrendRead;
  readonly named?: Promise<TrendRead>;
}

/** Reads the trend the address asks for: with no test the strongest change's, else the pod's first. */
export const trendLoader = (api: PodApi) =>
  screen(async ({ params, request }: LoaderFunctionArgs) => {
    const pod = params.pod ?? "";
    const asked = new URL(request.url).searchParams;
    const test = asked.get("test") || undefined;
    const medication = asked.get("medication") || undefined;
    const trend = async (named: boolean) =>
      maps(
        await api.trend({
          pod,
          ...(test !== undefined && { test }),
          ...(medication !== undefined && { medication }),
          named,
        }),
      ) as unknown as TrendRead;
    const later = warming();
    const read = await trend(!later);
    return {
      value: {
        pod,
        read,
        ...(later && {
          named: whenNamed(() => trend(true), read, "the trend's names"),
        }),
      } satisfies TrendAsked,
      title: trendTitle(read.series, read.about),
    };
  });

export function TrendScreen() {
  const { pod, read, named } = useRead<TrendAsked>();
  const { titles } = useApp();
  const came = useLate(named ?? read);
  return (
    <TrendPage
      pod={pod}
      titles={titles}
      read={came ?? read}
      naming={came === undefined}
    />
  );
}
