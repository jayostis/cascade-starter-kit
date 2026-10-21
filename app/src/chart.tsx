// A line of results over time as SVG, and the bars of the medications along the same days.
import {
  DAY_MS,
  day,
  dayAt,
  monthAt,
  near,
  rounded,
  spread,
  timeOf,
  type Mark,
  type Plot,
  type Point,
  type Therapy,
} from "../said.ts";

/**
 * A marker for each of `points` and the days in `marks` as dashed lines across them; with `axes` the days along the
 * bottom and the numbers at the left, in `unit`. The title and the description are what a screen reader says.
 */
export function Chart({
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
  plot: Plot;
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
      {axes && (
        <text
          className="tick"
          transform={`translate(14 ${near(margin.top + (bottom - margin.top) / 2)}) rotate(-90)`}
          textAnchor="middle"
        >
          {unit}
        </text>
      )}
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

/** The medications of `drugs` as bars from their start to their stop, to the right edge while one has none, along the days of `plot`. */
export function Lane({
  id,
  plot,
  drugs,
  chosen,
  title,
  desc,
}: {
  id: string;
  plot: Plot;
  drugs: readonly Therapy[];
  chosen: Therapy | undefined;
  title: string;
  desc: string;
}) {
  const { width, margin, from, to, x } = plot;
  const rowHeight = 32;
  const height = drugs.length * rowHeight + 8;
  return (
    <svg
      className="chart lane"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${id}-title ${id}-desc`}
    >
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-desc`}>{desc}</desc>
      {drugs.map((drug, at) => {
        const top = 4 + at * rowHeight;
        const start = drug.started ? timeOf(drug.started) : undefined;
        const end = drug.ended ? timeOf(drug.ended) : to;
        const drawn = start !== undefined && start <= to && end >= from;
        const left = drawn ? x(Math.max(start, from)) : margin.left;
        const across = drawn ? Math.max(2, x(Math.min(end, to)) - left) : 0;
        const on = drug === chosen;
        return (
          <g key={drug.key}>
            <text
              className={`lane-label${on ? " chosen" : ""}`}
              x={margin.left}
              y={top + 11}
            >
              {drug.name}
            </text>
            {drawn && (
              <rect
                className={`bar${on ? " chosen" : ""}`}
                x={near(left)}
                y={top + 16}
                width={near(across)}
                height="8"
                rx="4"
              >
                <title>
                  {`${drug.name}: ${drug.started ? `from ${day(drug.started)}` : "start not known"}${drug.ended ? ` to ${day(drug.ended)}` : ", not stopped"}`}
                </title>
              </rect>
            )}
          </g>
        );
      })}
    </svg>
  );
}
