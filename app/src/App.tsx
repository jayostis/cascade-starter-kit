// The app: the shell around the screen the address names. It reads the pods there are and, once the first screen is
// drawn, warms the engine in the background; `data-engine` on the body says when it is ready, and the screen then
// fills in what the tables say.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router";
import {
  maps,
  personName,
  slug,
  type Abouts,
  type Person,
  type VariantsSaid,
} from "../said.ts";
import { useInPlace } from "./address.tsx";
import { useHost, type PodApi, type PodListed } from "./api.tsx";
import { failed, firstReady, ready } from "./doing.ts";
import { PodPage, type PodShown } from "./pod.tsx";
import { Layout, type TablesHeld } from "./shell.tsx";

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

function Message({ heading, children }: { heading: string; children: string }) {
  useEffect(ready, []);
  return (
    <>
      <h1>{heading}</h1>
      <p>{children}</p>
    </>
  );
}

function NotPorted() {
  return (
    <Message heading="Not ported yet">
      This screen is still drawn by the app before React; it comes here in a
      later step.
    </Message>
  );
}

function NoPods() {
  useEffect(ready, []);
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

type Screen =
  | { readonly at: string; readonly page: PodShown }
  | { readonly at: string; readonly page: "unknown" | "locked" }
  | { readonly at: string; readonly page: { readonly wrong: string } };

function Wrong({ said }: { said: string }) {
  useEffect(failed, []);
  return (
    <>
      <h1>Something went wrong</h1>
      <p>{said}</p>
    </>
  );
}

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
  const { pod = "" } = useParams();
  const { pathname, search } = useLocation();
  const at = pathname + search;
  const [shown, setShown] = useState<Screen>();
  useEffect(() => {
    let live = true;
    (async () => {
      if (!pods.includes(pod)) return { at, page: "unknown" as const };
      const { locked } = await api.pod({ pod });
      if (locked !== undefined) return { at, page: "locked" as const };
      const answered = await api.answers({ pod });
      return {
        at,
        page: { pod, ...answered, ...(await saidOf(api, pod, engine)) },
      };
    })().then(
      (screen: Screen) => live && setShown(screen),
      (error: unknown) =>
        live &&
        setShown({
          at,
          page: {
            wrong: error instanceof Error ? error.message : String(error),
          },
        }),
    );
    return () => {
      live = false;
    };
  }, [api, at, pod, pods]);
  const page = shown?.page;
  useEffect(() => {
    if (
      engine === "waiting" ||
      typeof page !== "object" ||
      "wrong" in page ||
      page.about !== undefined
    )
      return;
    let live = true;
    void saidOf(api, page.pod, engine).then((said) => {
      if (live)
        setShown((now) =>
          now?.page === page ? { ...now, page: { ...page, ...said } } : now,
        );
    });
    return () => {
      live = false;
    };
  }, [api, engine, page]);
  useEffect(() => {
    if (shown?.at !== at || (typeof page === "object" && "wrong" in page))
      return;
    const title =
      typeof page === "object"
        ? personName(page.pod, titles)
        : page === "locked"
          ? "Open this pod"
          : "Not found";
    document.title = `${title} · Cascade`;
    ready();
  }, [shown, at, page, titles]);
  if (page === undefined) return null;
  if (typeof page === "object" && "wrong" in page)
    return <Wrong said={page.wrong} />;
  if (page === "unknown")
    return (
      <>
        <h1>Not found</h1>
        <p>This app keeps no pod named {pod}.</p>
      </>
    );
  if (page === "locked") return <NotPorted />;
  return (
    <PodPage
      shown={page}
      titles={titles}
      person={people.find((each) => slug(each.name) === page.pod)}
      held={held.held}
    />
  );
}

export function App() {
  const host = useHost();
  const { api } = host;
  const [pods, setPods] = useState<PodListed[]>();
  const [people, setPeople] = useState<Person[]>([]);
  const [tables, setTables] = useState<TablesHeld>({ held: [] });
  const [engine, setEngine] = useState<Engine>("waiting");
  const { pathname } = useLocation();
  const current = /\/pods\/([^/]+)/.exec(pathname)?.[1];
  const titles = useMemo(
    () => new Map((pods ?? []).map(({ name, title }) => [name, title])),
    [pods],
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
  useEffect(() => {
    void (async () => {
      setPeople(await host.people());
      await host.firstVisit();
      setPods((await api.pods()).pods);
    })().catch(failed);
  }, [api, host]);
  useEffect(() => {
    void firstReady
      .then(() => host.engine())
      .then(
        async () => {
          document.body.dataset.engine = "ready";
          const { held, failed: unread } = await api.held();
          setTables({ held, read: unread ? "failed" : "read" });
          setEngine("ready");
          await host.tables().catch(() => undefined);
          document.body.dataset.tables = "ready";
        },
        () => {
          setTables((now) => ({ ...now, read: now.read ?? "failed" }));
          setEngine("failed");
        },
      );
  }, [api, host]);
  const names = useMemo(() => (pods ?? []).map(({ name }) => name), [pods]);
  if (pods === undefined) return null;
  return (
    <Layout
      pods={names}
      titles={titles}
      current={current === undefined ? undefined : decodeURIComponent(current)}
      tables={tables}
      about={host.about}
    >
      <Routes>
        <Route
          path="/"
          element={
            names[0] === undefined ? (
              <NoPods />
            ) : (
              <Navigate to={`/pods/${encodeURIComponent(names[0])}/`} replace />
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
        <Route path="*" element={<NotPorted />} />
      </Routes>
    </Layout>
  );
}
