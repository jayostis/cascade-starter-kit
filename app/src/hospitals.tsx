// Bringing records in from a hospital: Find a hospital, the sign-in a click starts, the box over the pod's page that
// follows the connection until its record is here and brings it in, and the world's date the hospitals answer as of.
import { useEffect, useRef, type ReactNode } from "react";
import { Form, type LoaderFunctionArgs } from "react-router";
import {
  BRINGING,
  byFamily,
  counted,
  type Failure,
  failureSaid,
  familyFirst,
  gradePerson,
  hospitalName,
  importPart,
  listed,
  type Person,
  personName,
  pulledAsOfSaid,
  slug,
  typedName,
  worldDateSaid,
} from "../said.ts";
import { openSignIn } from "./actions.tsx";
import { ROUTED, useAddress } from "./address.tsx";
import {
  useHost,
  type ConnectionNow,
  type Hospital,
  type PodApi,
} from "./api.tsx";
import {
  card,
  lead,
  muted,
  note,
  noteWarm,
  quiet,
  row as rowLook,
} from "./look.ts";
import { Box, PostButton, StepFields, StepForm } from "./parts.tsx";
import { screen, useApp, useRead } from "./screen.tsx";

/** The world's date: what the hospitals answer as of, and a form to change it that opens at `#world-date`. */
export function WorldDate({ asOf }: { asOf: string | undefined }) {
  const opened = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (location.hash === "#world-date" && opened.current !== null)
      opened.current.open = true;
  }, []);
  const day =
    asOf === undefined
      ? undefined
      : new Date(Date.parse(asOf)).toISOString().slice(0, 10);
  return (
    <div className="world-date">
      <p className={muted}>{worldDateSaid(asOf)}</p>
      <details className="mb-3" id="world-date" ref={opened}>
        <summary className="cursor-pointer text-accent">
          Change the world's date
        </summary>
        <StepForm className="mr-[0.4rem] inline">
          <StepFields intent="world-date" doing="Setting the date…" />
          <label>
            Date{" "}
            <input
              key={day}
              type="date"
              name="date"
              defaultValue={day}
              required
            />
          </label>{" "}
          <button>Set</button>
        </StepForm>{" "}
        <PostButton
          intent="world-date"
          fields={{ date: "" }}
          className={quiet}
          doing="Setting the date…"
        >
          Today
        </PostButton>
      </details>
    </div>
  );
}

const STEP = {
  done: "done text-text before:text-accent before:content-['✓_']",
  now: "now font-semibold text-text before:content-['…_']",
  later: "text-muted before:content-['○_']",
};

/** Where a connection has got to, as a list of steps: those done ticked, the one under way marked. */
export function Steps({
  connection,
}: {
  connection: Pick<ConnectionNow, "step" | "requests" | "bringing">;
}) {
  const { step, requests, bringing } = connection;
  const at = ["signing in", "pulling", "pulled", "bringing in"].indexOf(step);
  const items = [
    at === 0 ? "Signing in at the hospital" : "Signed in at the hospital",
    at === 1
      ? `Fetching the record: ${requests} requests answered so far`
      : "Fetching the record",
    at === 2 ? `Record fetched, in ${requests} requests` : "Record fetched",
    ...(at === 3
      ? [
          `Bringing it in${bringing === undefined ? "" : `: ${importPart(bringing)}`}`,
        ]
      : []),
  ];
  return (
    <ul className="steps m-0 list-none p-0">
      {items.map((text, index) => {
        const state =
          index < at || at === 2 ? "done" : index === at ? "now" : "later";
        return (
          <li key={index} className={`py-[0.15rem] ${STEP[state]}`}>
            {text}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The box over the pod's page of the connection `now`, which closes to `back`: while it signs in, fetches or brings its
 * record in, its steps; once it failed, why, to the person by the failure's kind (`failures` replacing a kind's row
 * for the host), with `signInAgain(label)` where signing in again can help, and Try again where bringing it in can be
 * tried again; else what the hospital has, whose record it is when not the pod's person, and the button that brings it
 * in.
 */
export function ConnectionBox({
  pod,
  titles,
  now,
  back,
  failures,
  signInAgain,
}: {
  pod: string;
  titles?: ReadonlyMap<string, string>;
  now: ConnectionNow;
  back: string;
  failures?: Readonly<Record<string, Failure>>;
  signInAgain: (label: string) => ReactNode;
}) {
  useEffect(() => {
    if (location.hash === "#connection") location.replace("#connection");
  }, []);
  const who = personName(pod, titles);
  const typed = typedName(pod, titles);
  const grade =
    typed === undefined
      ? undefined
      : gradePerson(typed, now.patientNames ?? []);
  const name = hospitalName(now.row.name);
  const bring = (label: string, className?: string) => (
    <PostButton
      intent="bring"
      fields={{ connection: String(now.n) }}
      className={className}
      doing={BRINGING}
    >
      {label}
    </PostButton>
  );
  const box = (body: ReactNode) => (
    <Box id="connection" heading={name} back={back}>
      {body}
    </Box>
  );
  if (now.step === "bringing in")
    return box(
      <div className={card}>
        <Steps connection={now} />
      </div>,
    );
  if (now.step === "signing in" || now.step === "pulling")
    return box(
      <div className={card}>
        <Steps connection={now} />
        <p className={muted}>This refreshes itself until the record is here.</p>
      </div>,
    );
  if (now.failed !== undefined) {
    const person =
      now.failure === undefined
        ? undefined
        : failureSaid(now.failure, name, failures);
    return box(
      <div className={card}>
        {person === undefined ? (
          <p>{now.failed}</p>
        ) : (
          <>
            <p role="alert">{person.said}</p>
            {person.again && signInAgain(`Sign in again at ${name}`)}
            <p className="muted detail text-[0.85rem] text-muted">
              {now.failed}
            </p>
          </>
        )}
        {now.notRecorded !== undefined && (
          <p className={muted}>Not recorded: {now.notRecorded}</p>
        )}
        {now.retry && bring("Try again")}
      </div>,
    );
  }
  const about = now.patient;
  const denied = (now.pulled?.denied ?? []).map(({ type, category }) =>
    category === undefined ? type : `${type} (${category})`,
  );
  const missing = now.pulled?.missing ?? [];
  const asOf = pulledAsOfSaid(now.asOf);
  return box(
    <>
      <div className={card}>
        <Steps connection={now} />
      </div>
      {about !== undefined &&
        (grade === undefined ? (
          slug(about) !== pod && (
            <p className={note}>
              This record is {about}'s. Bringing it in makes this {about}'s pod.
            </p>
          )
        ) : grade === "possible" ? (
          <p className={muted}>This record is {about}'s.</p>
        ) : (
          grade === "certainly-not" && (
            <p className={noteWarm} role="alert">
              This record is {about}'s, not {who}'s.
            </p>
          )
        ))}
      <div className={card}>
        {(now.sources ?? []).map((source, at) => (
          <div key={at}>
            <p>
              <strong>What {name} has:</strong>{" "}
              {counted(source.records) || "nothing"}.
            </p>
            <p className={muted}>
              {who}'s pod{" "}
              {source.claimed
                ? "already has records from here"
                : "has nothing from here yet"}
              .
            </p>
          </div>
        ))}
        {missing.length > 0 && (
          <p className={muted}>Mentioned, but not sent: {missing.join(", ")}</p>
        )}
        {denied.length > 0 && (
          <p className={muted}>Not allowed to read: {denied.join(", ")}</p>
        )}
        {asOf !== undefined && <p className={muted}>{asOf}</p>}
        {now.notRecorded !== undefined && (
          <p className={muted}>Not recorded: {now.notRecorded}</p>
        )}
        {grade === "certainly-not"
          ? bring(`Bring ${about}'s records into ${who}'s pod anyway`, quiet)
          : grade === "possible"
            ? bring(`Bring ${about}'s records into ${who}'s pod`)
            : bring(`Bring it into ${who}'s pod`)}
      </div>
    </>,
  );
}

/** The box of the pod's connection `now`, its buttons signing in again and bringing the record in; it closes to the pod. */
export function Connection({
  pod,
  titles,
  now,
}: {
  pod: string;
  titles: ReadonlyMap<string, string>;
  now: ConnectionNow;
}) {
  const host = useHost();
  const address = useAddress();
  return (
    <ConnectionBox
      pod={pod}
      titles={titles}
      now={now}
      back={address.pod(pod)}
      failures={host.failures}
      signInAgain={(label) => (
        <SignIn fhirBase={now.row.fhirBase}>{label}</SignIn>
      )}
    />
  );
}

/**
 * A sign-in button for the hospital at `fhirBase`, saying `label`: in the host's own window when it has one, opened in
 * the click, and the pod's page then follows the connection in its box; else on the hospital's own page in place of
 * the app, which comes back by `/callback` to the box.
 */
export function SignIn({
  fhirBase,
  children,
}: {
  fhirBase: string;
  children: ReactNode;
}) {
  const host = useHost();
  return (
    <PostButton
      intent="sign-in"
      fields={{ fhirBase }}
      doing="Signing in…"
      onSubmit={() => openSignIn(host)}
    >
      {children}
    </PostButton>
  );
}

/** What Find a hospital is drawn from: the directory's rows a search found and the world's date. */
export interface HospitalsRead {
  readonly rows: readonly Hospital[];
  readonly asOf?: string;
}

/**
 * Finding a hospital for the pod: a search box for `q`, then a card per row of `read` with its places, its sign-in
 * button and the demo people among `people` it holds, family name first, each with where else they are; the world's
 * date above the cards.
 */
export function HospitalsPage({
  pod,
  titles,
  q,
  read,
  people,
}: {
  pod: string;
  titles: ReadonlyMap<string, string>;
  q: string;
  read: HospitalsRead;
  people: readonly Person[];
}) {
  const address = useAddress();
  const who = personName(pod, titles);
  return (
    <>
      <h1>Find a hospital</h1>
      <p className={lead}>
        Sign in on the hospital's own page, see what it has, and bring it into{" "}
        {who}'s pod.
      </p>
      <WorldDate asOf={read.asOf} />
      <Form
        method="get"
        action={ROUTED.hospitals(pod)}
        className={`${rowLook} ${card}`}
      >
        <input
          className="min-w-40 flex-1"
          key={q}
          name="q"
          defaultValue={q}
          placeholder="Search by name or place"
          aria-label="Search by name or place"
        />
        <button>Search</button>
      </Form>
      {read.rows.length === 0 ? (
        <p className={muted}>No hospital matches.</p>
      ) : (
        read.rows.map((row) => {
          const here = byFamily(people).filter((person) =>
            person.at.some((each) => each.fhirBase === row.fhirBase),
          );
          return (
            <div className={card} key={row.fhirBase}>
              <div className={rowLook}>
                <h2 className="m-0 flex-1">{hospitalName(row.name)}</h2>
                <SignIn fhirBase={row.fhirBase}>Sign in</SignIn>
              </div>
              {row.places !== undefined && (
                <p className={muted}>{row.places.join("; ")}</p>
              )}
              {here.length === 0 ? (
                <p className={muted}>
                  A test server: you choose a patient on its own sign-in page.
                </p>
              ) : (
                <>
                  <p className={muted}>Sample patients here:</p>
                  <ul>
                    {here.map((person) => {
                      const elsewhere = person.at
                        .filter((each) => each.fhirBase !== row.fhirBase)
                        .map(({ name }) => hospitalName(name));
                      return (
                        <li key={person.name}>
                          {familyFirst(person)}
                          {elsewhere.length > 0 && (
                            <>
                              {" "}
                              <span className={muted}>
                                also at {listed(elsewhere)}
                              </span>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          );
        })
      )}
      <p>
        <a href={address.pod(pod)}>Back to {who}</a>
      </p>
    </>
  );
}

interface HospitalsAsked {
  readonly pod: string;
  readonly q: string;
  readonly read: HospitalsRead;
}

/** Reads Find a hospital for the pod the address names, the address's `q` its search. */
export const hospitalsLoader = (api: PodApi) =>
  screen(async ({ params, request }: LoaderFunctionArgs) => {
    const pod = params.pod ?? "";
    const q = new URL(request.url).searchParams.get("q") ?? "";
    await api.pod({ pod });
    return {
      value: { pod, q, read: await api.hospitals({ q }) },
      title: "Find a hospital",
    };
  });

export function HospitalsScreen() {
  const { pod, q, read } = useRead<HospitalsAsked>();
  const { titles, people } = useApp();
  return (
    <HospitalsPage
      pod={pod}
      titles={titles}
      q={q}
      read={read}
      people={people}
    />
  );
}
