// Bringing records in from a hospital: Find a hospital, the sign-in a click starts, the box over the pod's page that
// follows the connection until its record is here and brings it in, and the world's date the hospitals answer as of.
import { useEffect, useRef, type ReactNode } from "react";
import { useLocation, useParams } from "react-router";
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
import { useActions } from "./actions.tsx";
import { BASE, ROUTED, useAddress } from "./address.tsx";
import { useHost, type ConnectionNow, type Hospital } from "./api.tsx";
import { isBusy, ready } from "./doing.ts";
import { Box, PostButton } from "./parts.tsx";
import { NotFound, useLoaded, Wrong } from "./screen.tsx";

/** The router's path of the address shown, without its hash. */
const shownNow = () =>
  `/${location.pathname.slice(BASE.length)}${location.search}`;

/**
 * Signs the pod in at the hospital at a `fhirBase`, from the click that asks: in the host's own window when it has one,
 * opened in the click, and the box then follows the connection; else on the hospital's own page in place of the app,
 * which comes back by `/callback` to the box. The page says it is ready before it leaves, so that Back from the
 * hospital finds it as it was.
 */
export function useSignIn(pod: string): (fhirBase: string) => void {
  const host = useHost();
  const { act } = useActions();
  return (fhirBase) => {
    if (isBusy()) return;
    const inWindow = host.openSignIn !== undefined;
    host.openSignIn?.();
    act(async (go) => {
      const { connection, authorize } = await host.api.connect({
        pod,
        fhirBase,
      });
      if (inWindow || authorize === undefined)
        return go(ROUTED.connection(pod, connection));
      ready();
      location.assign(authorize);
    }, "Signing in…");
  };
}

/** The world's date: what the hospitals answer as of, and a form to change it that opens at `#world-date`. */
export function WorldDate({ asOf }: { asOf: string | undefined }) {
  const { api } = useHost();
  const { act } = useActions();
  const opened = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (location.hash === "#world-date" && opened.current !== null)
      opened.current.open = true;
  }, []);
  const set = (date: string) =>
    act(async (go) => {
      await api.setWorldDate({ date });
      go(shownNow());
    }, "Setting the date…");
  const day =
    asOf === undefined
      ? undefined
      : new Date(Date.parse(asOf)).toISOString().slice(0, 10);
  return (
    <div className="world-date">
      <p className="muted">{worldDateSaid(asOf)}</p>
      <details id="world-date" ref={opened}>
        <summary>Change the world's date</summary>
        <form
          method="post"
          action="world-date"
          className="inline"
          data-doing="Setting the date…"
          onSubmit={(event) => {
            event.preventDefault();
            set(String(new FormData(event.currentTarget).get("date") ?? ""));
          }}
        >
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
        </form>{" "}
        <PostButton
          action="world-date"
          fields={{ date: "" }}
          className="quiet"
          doing="Setting the date…"
          onPost={() => set("")}
        >
          Today
        </PostButton>
      </details>
    </div>
  );
}

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
    <ul className="steps">
      {items.map((text, index) => {
        const state =
          index < at || at === 2 ? "done" : index === at ? "now" : undefined;
        return (
          <li key={index} className={state}>
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
 * in, `onBring`.
 */
export function ConnectionBox({
  pod,
  titles,
  now,
  back,
  failures,
  signInAgain,
  onBring,
}: {
  pod: string;
  titles?: ReadonlyMap<string, string>;
  now: ConnectionNow;
  back: string;
  failures?: Readonly<Record<string, Failure>>;
  signInAgain: (label: string) => ReactNode;
  onBring: () => void;
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
      action="bring"
      className={className}
      doing={BRINGING}
      onPost={onBring}
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
      <div className="card">
        <Steps connection={now} />
      </div>,
    );
  if (now.step === "signing in" || now.step === "pulling")
    return box(
      <div className="card">
        <Steps connection={now} />
        <p className="muted">This refreshes itself until the record is here.</p>
      </div>,
    );
  if (now.failed !== undefined) {
    const person =
      now.failure === undefined
        ? undefined
        : failureSaid(now.failure, name, failures);
    return box(
      <div className="card">
        {person === undefined ? (
          <p>{now.failed}</p>
        ) : (
          <>
            <p role="alert">{person.said}</p>
            {person.again && signInAgain(`Sign in again at ${name}`)}
            <p className="muted detail">{now.failed}</p>
          </>
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
      <div className="card">
        <Steps connection={now} />
      </div>
      {about !== undefined &&
        (grade === undefined ? (
          slug(about) !== pod && (
            <p className="note">
              This record is {about}'s. Bringing it in makes this {about}'s pod.
            </p>
          )
        ) : grade === "possible" ? (
          <p className="muted">This record is {about}'s.</p>
        ) : (
          grade === "certainly-not" && (
            <p className="note warm" role="alert">
              This record is {about}'s, not {who}'s.
            </p>
          )
        ))}
      <div className="card">
        {(now.sources ?? []).map((source, at) => (
          <div key={at}>
            <p>
              <strong>What {name} has:</strong>{" "}
              {counted(source.records) || "nothing"}.
            </p>
            <p className="muted">
              {who}'s pod{" "}
              {source.claimed
                ? "already has records from here"
                : "has nothing from here yet"}
              .
            </p>
          </div>
        ))}
        {missing.length > 0 && (
          <p className="muted">Mentioned, but not sent: {missing.join(", ")}</p>
        )}
        {denied.length > 0 && (
          <p className="muted">Not allowed to read: {denied.join(", ")}</p>
        )}
        {asOf !== undefined && <p className="muted">{asOf}</p>}
        {grade === "certainly-not"
          ? bring(`Bring ${about}'s records into ${who}'s pod anyway`, "quiet")
          : grade === "possible"
            ? bring(`Bring ${about}'s records into ${who}'s pod`)
            : bring(`Bring it into ${who}'s pod`)}
      </div>
    </>,
  );
}

/**
 * The box of the pod's connection `now`, its buttons signing in again and bringing the record in, which `follow` then
 * draws as it comes in; it closes to the pod.
 */
export function Connection({
  pod,
  titles,
  now,
  follow,
}: {
  pod: string;
  titles: ReadonlyMap<string, string>;
  now: ConnectionNow;
  follow: (n: number) => void;
}) {
  const host = useHost();
  const address = useAddress();
  const { act } = useActions();
  return (
    <ConnectionBox
      pod={pod}
      titles={titles}
      now={now}
      back={address.pod(pod)}
      failures={host.failures}
      signInAgain={(label) => (
        <SignIn pod={pod} fhirBase={now.row.fhirBase}>
          {label}
        </SignIn>
      )}
      onBring={() =>
        act(async (go) => {
          await host.api.bring({ pod, connection: now.n });
          go.stay();
          follow(now.n);
        }, BRINGING)
      }
    />
  );
}

/** A sign-in button for the hospital at `fhirBase`, saying `label`. */
export function SignIn({
  pod,
  fhirBase,
  children,
}: {
  pod: string;
  fhirBase: string;
  children: ReactNode;
}) {
  const signIn = useSignIn(pod);
  return (
    <PostButton
      action="sign-in"
      fields={{ fhirBase }}
      doing="Signing in…"
      onPost={() => signIn(fhirBase)}
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
  const { act } = useActions();
  const who = personName(pod, titles);
  return (
    <>
      <h1>Find a hospital</h1>
      <p className="lead">
        Sign in on the hospital's own page, see what it has, and bring it into{" "}
        {who}'s pod.
      </p>
      <WorldDate asOf={read.asOf} />
      <form
        method="get"
        action={address.hospitals(pod)}
        className="row card"
        data-doing="Searching…"
        onSubmit={(event) => {
          event.preventDefault();
          const asked = String(
            new FormData(event.currentTarget).get("q") ?? "",
          );
          act(async (go) => go(ROUTED.hospitals(pod, asked)), "Searching…");
        }}
      >
        <input
          key={q}
          name="q"
          defaultValue={q}
          placeholder="Search by name or place"
          aria-label="Search by name or place"
        />
        <button>Search</button>
      </form>
      {read.rows.length === 0 ? (
        <p className="muted">No hospital matches.</p>
      ) : (
        read.rows.map((row) => {
          const here = byFamily(people).filter((person) =>
            person.at.some((each) => each.fhirBase === row.fhirBase),
          );
          return (
            <div className="card" key={row.fhirBase}>
              <div className="row">
                <h2>{hospitalName(row.name)}</h2>
                <SignIn pod={pod} fhirBase={row.fhirBase}>
                  Sign in
                </SignIn>
              </div>
              {row.places !== undefined && (
                <p className="muted">{row.places.join("; ")}</p>
              )}
              {here.length === 0 ? (
                <p className="muted">
                  A test server: you choose a patient on its own sign-in page.
                </p>
              ) : (
                <>
                  <p className="muted">Sample patients here:</p>
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
                              <span className="muted">
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

/** Find a hospital for the pod the address names, the address's `q` its search. */
export function HospitalsScreen({
  titles,
  people,
}: {
  titles: ReadonlyMap<string, string>;
  people: readonly Person[];
}) {
  const { pod = "" } = useParams();
  const { pathname, search } = useLocation();
  const q = new URLSearchParams(search).get("q") ?? "";
  const loaded = useLoaded<HospitalsRead>(
    pathname + search,
    async (api) => {
      await api.pod({ pod });
      return api.hospitals({ q });
    },
    () => "Find a hospital",
  );
  if (loaded === undefined) return null;
  if ("wrong" in loaded) return <Wrong said={loaded.wrong} />;
  if ("refused" in loaded) return <NotFound said={loaded.refused} />;
  return (
    <HospitalsPage
      pod={pod}
      titles={titles}
      q={q}
      read={loaded.value}
      people={people}
    />
  );
}
