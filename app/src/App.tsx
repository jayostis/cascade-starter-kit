// The app: the shell around the screen the address names. It reads the pods there are and, once the first screen is
// drawn, warms the engine in the background; `data-engine` on the body says when it is ready, and the screen then
// fills in what the tables say.
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import {
  BRINGING,
  maps,
  personName,
  slug,
  type Abouts,
  type Person,
  type VariantsSaid,
} from "../said.ts";
import { Notice, ActionsProvider, type Actions } from "./actions.tsx";
import {
  byStep,
  goState,
  ROUTED,
  useGeneration,
  useInPlace,
  useOpening,
} from "./address.tsx";
import {
  HostProvider,
  isRefusal,
  useHost,
  type ChatModel,
  type ConnectionNow,
  type Host,
  type PodApi,
  type PodListed,
} from "./api.tsx";
import { AskProvider } from "./ask.tsx";
import { ClassesScreen } from "./classes.tsx";
import { ConfirmProvider } from "./confirm.tsx";
import {
  busy,
  failed,
  firstReady,
  flight,
  isBusy,
  isStepping,
  ready,
  type Outcome,
} from "./doing.ts";
import { EntryScreen } from "./entry.tsx";
import { HospitalsScreen } from "./hospitals.tsx";
import { Unlock, WordsScreen } from "./newpod.tsx";
import { PanelScreen } from "./panel.tsx";
import { PodPage, type PodShown } from "./pod.tsx";
import { NotFound, Wrong } from "./screen.tsx";
import { Layout, type TablesHeld } from "./shell.tsx";
import { TableScreen } from "./tables.tsx";
import { usePodTools } from "./tools.ts";
import { TrendScreen } from "./trend.tsx";

type Engine = "waiting" | "ready" | "failed";

/** What the tables say of the pod's codes and variants: nothing while the engine warms, no names once it cannot say. */
async function saidOf(
  api: PodApi,
  pod: string,
  engine: Engine,
): Promise<Pick<PodShown, "about" | "said">> {
  if (engine !== "ready")
    return engine === "failed" ? { about: new Map() } : {};
  try {
    const { about, said } = maps(await api.said({ pod })) as {
      about?: Abouts;
      said?: VariantsSaid;
    };
    return { about: about ?? new Map(), ...(said !== undefined && { said }) };
  } catch {
    return { about: new Map() };
  }
}

/** The pod's connection numbered `n` in the address, as `connection` gives it; none for no number, or one it has not. */
async function connectionAt(
  api: PodApi,
  pod: string,
  n: string | null,
): Promise<ConnectionNow | undefined> {
  if (n === null || !/^\d+$/.test(n)) return undefined;
  try {
    return await api.connection({ pod, connection: Number(n) });
  } catch (error) {
    if (error instanceof Error && error.name === "Refusal") return undefined;
    throw error;
  }
}

/** The old address of a pod's connection, which goes to the pod's page with the connection's box over it. */
function ConnectionAddress() {
  const { pod = "", n = "" } = useParams();
  return (
    <Navigate
      to={/^\d+$/.test(n) ? ROUTED.connection(pod, Number(n)) : ROUTED.pod(pod)}
      replace
    />
  );
}

function Message({ heading, children }: { heading: string; children: string }) {
  const generation = useGeneration();
  useEffect(ready, [generation]);
  return (
    <>
      <h1>{heading}</h1>
      <p>{children}</p>
    </>
  );
}

function NoPage() {
  return (
    <Message heading="Not found">This app has no page at this address.</Message>
  );
}

function NoPods() {
  const generation = useGeneration();
  useEffect(ready, [generation]);
  return (
    <>
      <h1>No pods yet</h1>
      <p className="lead">
        A pod keeps one person's health records, wherever they come from.
      </p>
      <p>
        <a className="button" href="#new-pod">
          Make your first pod
        </a>
      </p>
    </>
  );
}

interface Locked {
  readonly at: string;
  readonly page: "locked";
  /** How the pod last failed to open. */
  readonly outcome: string;
}

type Screen = (
  | {
      readonly at: string;
      readonly page: PodShown;
      /** Whether a step's move read it, which then says it is drawn only once the tables have named it. */
      readonly stepped?: boolean;
    }
  | { readonly at: string; readonly page: "unknown" }
  | Locked
  | { readonly at: string; readonly page: { readonly wrong: string } }
) & {
  /** The step's move it was read for, when it was read for one. */
  readonly generation?: number;
};

/** The pod the address names, drawn from its answers, then filled in once the engine can say what the tables say. */
function PodScreen({
  pods,
  titles,
  people,
  held,
  engine,
}: {
  pods: readonly string[];
  titles: ReadonlyMap<string, string>;
  people: readonly Person[];
  held: TablesHeld;
  engine: Engine;
}) {
  const { api } = useHost();
  const navigate = useNavigate();
  const { pod = "" } = useParams();
  const { pathname, search, state } = useLocation();
  const at = pathname + search;
  const generation = useGeneration();
  const stepped = byStep(state);
  const [shown, setShown] = useState<Screen>();
  const saidReady = useRef<string>(undefined);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!pods.includes(pod)) return { at, page: "unknown" as const };
      const { locked } = await api.pod({ pod });
      if (locked !== undefined)
        return { at, page: "locked" as const, outcome: locked };
      const [answered, { asOf }, connection] = await Promise.all([
        api.answers({ pod }),
        api.hospitals({}),
        connectionAt(api, pod, new URLSearchParams(search).get("connection")),
      ]);
      return {
        at,
        stepped,
        page: {
          pod,
          ...answered,
          ...(asOf !== undefined && { asOf }),
          ...(connection?.broughtIn
            ? { from: connection.row.name }
            : connection !== undefined && { connection }),
          ...(await saidOf(api, pod, engine)),
        },
      };
    })().then(
      (screen: Screen) => live && setShown({ ...screen, generation }),
      (error: unknown) =>
        live &&
        setShown({
          at,
          generation,
          page: {
            wrong: error instanceof Error ? error.message : String(error),
          },
        }),
    );
    return () => {
      live = false;
    };
  }, [api, at, pod, pods, generation]);
  const page = shown?.page;
  const unnamed =
    typeof page === "object" && "pod" in page && page.about === undefined
      ? page.answers
      : undefined;
  const unnamedPod =
    typeof page === "object" && "pod" in page ? page.pod : undefined;
  useEffect(() => {
    if (
      engine === "waiting" ||
      unnamed === undefined ||
      unnamedPod === undefined
    )
      return;
    let live = true;
    void saidOf(api, unnamedPod, engine).then((said) => {
      if (live)
        setShown((now) =>
          typeof now?.page === "object" &&
          "pod" in now.page &&
          now.page.answers === unnamed
            ? { ...now, page: { ...now.page, ...said } }
            : now,
        );
    });
    return () => {
      live = false;
    };
  }, [api, engine, unnamed, unnamedPod]);
  const following =
    typeof page === "object" &&
    !("wrong" in page) &&
    page.connection?.settled === false
      ? page.connection
      : undefined;
  const followed = following?.n;
  const tracked = useRef<number>(undefined);
  const looping = useRef<AbortController>(undefined);
  const follow = useCallback(
    (n: number) => {
      if (tracked.current === n) return;
      tracked.current = n;
      const { signal } = (looping.current = new AbortController());
      void (async () => {
        for (let wait: "change" | undefined; ; wait = "change") {
          const now = await api.connection({ pod, connection: n, wait });
          if (signal.aborted) return;
          if (now.broughtIn) {
            tracked.current = undefined;
            return navigate(at, { replace: true, state: goState() });
          }
          flushSync(() =>
            setShown((was) =>
              typeof was?.page === "object" &&
              "pod" in was.page &&
              was.page.connection?.n === n
                ? { ...was, page: { ...was.page, connection: now } }
                : was,
            ),
          );
          if (now.settled) {
            tracked.current = undefined;
            return;
          }
        }
      })().catch(
        (error: unknown) =>
          !signal.aborted &&
          setShown({
            at,
            page: {
              wrong: error instanceof Error ? error.message : String(error),
            },
          }),
      );
    },
    [api, at, navigate, pod],
  );
  useEffect(() => {
    if (followed !== undefined) follow(followed);
  }, [follow, followed]);
  useEffect(
    () => () => {
      tracked.current = undefined;
      looping.current?.abort();
    },
    [at],
  );
  useEffect(() => {
    if (shown?.at !== at) return;
    if (typeof page === "object" && "wrong" in page)
      return failed(`the pod's page could not be read: ${page.wrong}`);
    if (following !== undefined) {
      if (!isBusy())
        busy(following.step === "bringing in" ? BRINGING : "Signing in…");
      return;
    }
    if (
      "stepped" in shown &&
      shown.stepped &&
      typeof page === "object" &&
      page.about === undefined
    )
      return;
    const title =
      typeof page === "object"
        ? personName(page.pod, titles)
        : page === "locked"
          ? "Open this pod"
          : "Not found";
    document.title = `${title} · Cascade`;
    if (typeof page === "object" && page.connection?.retry)
      return failed(
        `the connection failed: ${page.connection.failed ?? page.connection.step}`,
      );
    const drawing = `${at} ${shown.generation}`;
    if (isStepping() && saidReady.current === drawing) return;
    saidReady.current = drawing;
    ready();
  }, [shown, at, page, titles, following]);
  if (shown === undefined) return null;
  if (shown.page === "locked")
    return <Unlock pod={pod} titles={titles} outcome={shown.outcome} />;
  const screen = shown.page;
  if (screen === "unknown")
    return <NotFound said={`This app keeps no pod named ${pod}.`} />;
  if ("wrong" in screen) return <Wrong said={screen.wrong} />;
  return (
    <PodPage
      shown={screen}
      titles={titles}
      person={people.find((each) => slug(each.name) === screen.pod)}
      held={held.held}
      follow={follow}
    />
  );
}

/** PodApi, with a pod that will not open drawing its unlock screen where it was asked for. */
export function locking(
  api: PodApi,
  locked: (pod: string, outcome: string) => void,
): PodApi {
  type Operation = (input?: { pod?: string }) => Promise<unknown>;
  return Object.fromEntries(
    (Object.entries(api) as [string, Operation][]).map(([name, run]) => [
      name,
      name === "unlock"
        ? run
        : async (input?: { pod?: string }) => {
            try {
              return await run(input);
            } catch (error) {
              if (
                error instanceof Error &&
                error.name === "Unopened" &&
                input?.pod !== undefined
              )
                locked(
                  input.pod,
                  (error as Error & { outcome?: string }).outcome ??
                    "secret needed",
                );
              throw error;
            }
          },
    ]),
  ) as unknown as PodApi;
}

/**
 * Closes the box open by the address's hash, as its close link does, so that what a step shows is not hidden behind it.
 * A box the browser opened stays open after a move that drops the hash from the address, so it is closed too.
 */
function closeBox() {
  if (location.hash === "" && document.querySelector(":target") === null)
    return;
  location.replace("#");
  history.replaceState(null, "", location.pathname + location.search);
}

/** What a step left for the address `at` to say: a note above its screen, or why it did not go through. */
interface Left {
  readonly at: string;
}

export function App() {
  const host = useHost();
  const { api } = host;
  const navigate = useNavigate();
  const [pods, setPods] = useState<PodListed[]>();
  const [people, setPeople] = useState<Person[]>([]);
  const [tables, setTables] = useState<TablesHeld>({ held: [] });
  const [engine, setEngine] = useState<Engine>("waiting");
  const [note, setNote] = useState<Left & { readonly text: string }>();
  const [outcome, setOutcome] = useState<Left & Outcome & { n: number }>();
  const [locked, setLocked] = useState<
    Left & { pod: string; outcome: string }
  >();
  const { pathname, search, hash } = useLocation();
  const here = pathname + search;
  const hereRef = useRef(here);
  useLayoutEffect(() => {
    hereRef.current = here;
  });
  useOpening();
  const current = /\/pods\/([^/]+)/.exec(pathname)?.[1];
  const onTable = /^\/tables(\/|$)/.test(pathname);
  const table = /^\/tables\/([^/]+)/.exec(pathname)?.[1];
  const titles = useMemo(
    () => new Map((pods ?? []).map(({ name, title }) => [name, title])),
    [pods],
  );
  useEffect(() => {
    setNote((now) => (now?.at === here ? now : undefined));
    setOutcome((now) => (now?.at === here ? now : undefined));
    setLocked((now) => (now?.at === here ? now : undefined));
  }, [here]);
  const guarded = useMemo<Host>(
    () => ({
      ...host,
      api: locking(api, (pod, outcome) =>
        setLocked({ pod, outcome, at: hereRef.current }),
      ),
    }),
    [host, api],
  );
  const act = useCallback<Actions["act"]>(
    (step, doing = "Working…") => {
      let unopened = false;
      void flight(
        async () => {
          let going = false;
          try {
            const go = (to: string, text?: string) => {
              going = true;
              const [path = to, hash] = to.split("#");
              if (hash === undefined || location.hash !== `#${hash}`)
                closeBox();
              setLocked(undefined);
              setNote(text === undefined ? undefined : { text, at: path });
              navigate(to, {
                state: goState(),
                replace: path === hereRef.current,
              });
            };
            await step(
              Object.assign(go, {
                stay: () => {
                  going = true;
                },
              }),
            );
          } catch (error) {
            unopened = error instanceof Error && error.name === "Unopened";
            throw error;
          }
          return going;
        },
        doing,
        isRefusal,
      ).then((left) => {
        if (left === undefined || unopened) return;
        closeBox();
        setOutcome((now) => ({
          ...left,
          at: hereRef.current,
          n: (now?.n ?? 0) + 1,
        }));
      });
    },
    [navigate],
  );
  const refreshPods = useCallback(async () => {
    const { pods: listed } = await api.pods();
    setPods((now) =>
      JSON.stringify(now) === JSON.stringify(listed) ? now : listed,
    );
    return listed.map(({ name }) => name);
  }, [api]);
  const heldNow = useCallback<Actions["heldNow"]>(
    (held) => setTables({ held, read: "read" }),
    [],
  );
  const actions = useMemo<Actions>(
    () => ({ act, refreshPods, heldNow }),
    [act, refreshPods, heldNow],
  );
  useInPlace(
    useCallback(
      (to: URL) => {
        const name = /\/pods\/([^/]+)/.exec(to.pathname)?.[1];
        return name === undefined
          ? "Opening…"
          : `Opening ${personName(decodeURIComponent(name), titles)}'s pod…`;
      },
      [titles],
    ),
  );
  const opened = pods !== undefined;
  const told = useRef(false);
  useLayoutEffect(() => {
    // The shell is drawn once the pods are read, after the browser matched `:target`, so a load at `#about` is told
    // again, once: `location.replace` wipes `history.state`, which a step's move and the router's keys live in.
    if (!opened || told.current) return;
    told.current = true;
    if (/^#[^/]+$/.test(location.hash)) location.replace(location.hash);
  }, [opened]);
  useEffect(() => {
    void (async () => {
      setPeople(await host.people());
      await host.firstVisit();
      setPods((await api.pods()).pods);
    })().catch((error: unknown) => {
      failed(
        `the pods could not be listed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, [api, host]);
  useEffect(() => {
    void firstReady
      .then(() => host.engine())
      .then(async () => {
        document.body.dataset.engine = "ready";
        const { held, failed: unread } = await api.held();
        setTables({ held, read: unread ? "failed" : "read" });
        setEngine("ready");
        await host.tables().catch(() => undefined);
        document.body.dataset.tables = "ready";
      })
      .catch(() => {
        setTables((now) => ({ ...now, read: now.read ?? "failed" }));
        setEngine("failed");
      });
  }, [api, host]);
  const [model, setModel] = useState<{ named?: ChatModel }>();
  useEffect(() => {
    void host.chat?.model().then(
      (named) => setModel(named === undefined ? {} : { named }),
      () => setModel({}),
    );
  }, [host]);
  const names = useMemo(() => (pods ?? []).map(({ name }) => name), [pods]);
  const shown = current === undefined ? undefined : decodeURIComponent(current);
  const known =
    shown !== undefined && names.includes(shown) ? shown : undefined;
  usePodTools(known);
  if (pods === undefined) return null;
  const Chat = host.chat?.Window;
  return (
    <HostProvider value={guarded}>
      <ActionsProvider value={actions}>
        <ConfirmProvider>
          <AskProvider value={model?.named !== undefined}>
            <Layout
              pods={names}
              titles={titles}
              current={
                current === undefined ? undefined : decodeURIComponent(current)
              }
              table={onTable ? decodeURIComponent(table ?? "") : undefined}
              tables={tables}
              about={host.about}
              people={people}
              samples={host.samples}
              note={note?.at === here ? note.text : undefined}
              chat={
                Chat !== undefined &&
                model !== undefined && (
                  <Suspense fallback={null}>
                    <Chat model={model.named} pod={known ?? ""} />
                  </Suspense>
                )
              }
            >
              {outcome?.at === here ? (
                <Notice
                  heading={
                    outcome.refused ? "Not done" : "Something went wrong"
                  }
                  wrong={!outcome.refused}
                  drawn={outcome.n}
                >
                  {outcome.said}
                </Notice>
              ) : locked?.at === here ? (
                <Unlock
                  key={locked.pod}
                  pod={locked.pod}
                  titles={titles}
                  outcome={locked.outcome}
                />
              ) : (
                <Routes>
                  <Route
                    path="/"
                    element={
                      names[0] === undefined ? (
                        <NoPods />
                      ) : (
                        <Navigate
                          to={`/pods/${encodeURIComponent(names[0])}/${hash}`}
                          replace
                        />
                      )
                    }
                  />
                  <Route
                    path="/pods/:pod"
                    element={
                      <PodScreen
                        pods={names}
                        titles={titles}
                        people={people}
                        held={tables}
                        engine={engine}
                      />
                    }
                  />
                  <Route
                    path="/pods/:pod/entries/:id"
                    element={
                      <EntryScreen
                        titles={titles}
                        held={tables}
                        engine={engine}
                      />
                    }
                  />
                  <Route
                    path="/pods/:pod/trend"
                    element={<TrendScreen titles={titles} engine={engine} />}
                  />
                  <Route
                    path="/pods/:pod/classes"
                    element={<ClassesScreen titles={titles} />}
                  />
                  <Route
                    path="/pods/:pod/panel"
                    element={<PanelScreen titles={titles} />}
                  />
                  <Route
                    path="/pods/:pod/hospitals"
                    element={
                      <HospitalsScreen titles={titles} people={people} />
                    }
                  />
                  <Route
                    path="/pods/:pod/connections/:n"
                    element={<ConnectionAddress />}
                  />
                  <Route
                    path="/tables/:id?"
                    element={<TableScreen pods={names} titles={titles} />}
                  />
                  <Route
                    path="/encrypted-pods/:pod"
                    element={<WordsScreen />}
                  />
                  <Route path="*" element={<NoPage />} />
                </Routes>
              )}
            </Layout>
          </AskProvider>
        </ConfirmProvider>
      </ActionsProvider>
    </HostProvider>
  );
}
