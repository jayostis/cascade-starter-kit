// The app: its routes, each screen's loader and the one action every route has, and the shell around the screen the
// address names. The root route reads the pods there are and the reference tables held, the tables once the engine,
// warmed in the background after the first screen is drawn, can say.
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  Outlet,
  replace,
  useLocation,
  useRouteLoaderData,
  type LoaderFunctionArgs,
  type RouteObject,
  type ShouldRevalidateFunction,
} from "react-router";
import type { Person } from "../said.ts";
import { steps, type Stayed } from "./actions.tsx";
import { ROUTED, useInPlace } from "./address.tsx";
import { useHost, type ChatModel, type Host } from "./api.tsx";
import { AskProvider } from "./ask.tsx";
import { ClassesScreen, classesLoader } from "./classes.tsx";
import { ConfirmProvider } from "./confirm.tsx";
import { PageState } from "./doing.ts";
import { warming, whenNamed } from "./engine.ts";
import { EntryScreen, entryLoader } from "./entry.tsx";
import { HospitalsScreen, hospitalsLoader } from "./hospitals.tsx";
import { button, lead } from "./look.ts";
import { WordsScreen, wordsLoader } from "./newpod.tsx";
import { PanelScreen, panelLoader } from "./panel.tsx";
import { closeBox } from "./parts.tsx";
import { PodScreen, podLoader } from "./pod.tsx";
import {
  Broken,
  Screen,
  screen,
  useApp,
  useLate,
  type AppRead,
  type Read,
} from "./screen.tsx";
import { Layout, type TablesHeld } from "./shell.tsx";
import { TableScreen, tableLoader, type TableAsked } from "./tables.tsx";
import { WebTools } from "./tools.ts";
import { TrendScreen, trendLoader } from "./trend.tsx";

function NoPage() {
  return (
    <>
      <h1>Not found</h1>
      <p>This app has no page at this address.</p>
    </>
  );
}

function NoPods() {
  return (
    <>
      <h1>No pods yet</h1>
      <p className={lead}>
        A pod keeps one person's health records, wherever they come from.
      </p>
      <p>
        <a className={button} href="#new-pod">
          Make your first pod
        </a>
      </p>
    </>
  );
}

/**
 * Whether a route reads again: never for a move between a box's address and its screen's, nor for a step whose
 * action stayed to say something (a refusal, a hospital's page to leave for, the six words' or the unlock's outcome);
 * else as the router does, after every other step and for a move to another address.
 */
const reread: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formMethod,
  actionResult,
  defaultShouldRevalidate,
}) => {
  if (
    formMethod === undefined &&
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search === nextUrl.search &&
    currentUrl.hash !== nextUrl.hash
  )
    return false;
  const said = (actionResult ?? {}) as Stayed;
  if (
    [said.refused, said.leave, said.problem, said.unopened].some(
      (each) => each !== undefined,
    )
  )
    return false;
  return defaultShouldRevalidate;
};

/** The routes of the app over `host`: the root's shell around every screen, each with its loader and the steps. */
export function routes(host: Host): RouteObject[] {
  const { api } = host;
  let opened: Promise<Person[]> | undefined;
  /** The demo people, once the samples a first visit copies are in: read once, before any screen is. */
  const opening = () =>
    (opened ??= host.people().then(async (people) => {
      await host.firstVisit();
      return people;
    }));
  const action = steps(host);
  const leaf = <T,>(
    path: string,
    load: (args: LoaderFunctionArgs) => Promise<Read<T>>,
    Drawn: ComponentType,
    id?: string,
  ): RouteObject => ({
    ...(id !== undefined && { id }),
    path,
    loader: async (args) => {
      await opening();
      return load(args);
    },
    action,
    shouldRevalidate: reread,
    element: (
      <Screen>
        <Drawn />
      </Screen>
    ),
  });
  const held = async (): Promise<TablesHeld> => {
    try {
      const { held, failed } = await api.held();
      return { held, read: failed === true ? "failed" : "read" };
    } catch {
      return { held: [], read: "failed" };
    }
  };
  const home = screen(async () => {
    const [first] = (await api.pods()).pods;
    if (first === undefined) return { value: null, title: "No pods yet" };
    const loading =
      typeof document !== "undefined" &&
      document.body.dataset.state === "opening";
    throw replace(`${ROUTED.pod(first.name)}${loading ? location.hash : ""}`);
  });
  return [
    {
      id: "root",
      async loader(): Promise<AppRead> {
        const people = await opening();
        const { pods } = await api.pods();
        const tables = whenNamed(held, { held: [], read: "failed" });
        return { pods, people, held: warming() ? tables : await tables };
      },
      shouldRevalidate: reread,
      element: <Shell />,
      errorElement: <Broken />,
      children: [
        {
          errorElement: <Broken />,
          children: [
            leaf("/", home, NoPods),
            leaf("pods/:pod", podLoader(api), PodScreen),
            leaf("pods/:pod/entries/:id", entryLoader(api), EntryScreen),
            leaf("pods/:pod/trend", trendLoader(api), TrendScreen),
            leaf("pods/:pod/classes", classesLoader(api), ClassesScreen),
            leaf("pods/:pod/panel", panelLoader(api), PanelScreen),
            leaf("pods/:pod/hospitals", hospitalsLoader(api), HospitalsScreen),
            {
              path: "pods/:pod/connections/:n",
              loader({ params: { pod = "", n = "" } }) {
                throw replace(
                  /^\d+$/.test(n)
                    ? ROUTED.connection(pod, Number(n))
                    : ROUTED.pod(pod),
                );
              },
            },
            leaf("tables/:id?", tableLoader(api), TableScreen, "table"),
            leaf("encrypted-pods/:pod", wordsLoader(api), WordsScreen),
            leaf(
              "*",
              screen(async () => ({ value: null, title: "Not found" })),
              NoPage,
            ),
          ],
        },
      ],
    },
  ];
}

/** The shell every screen sits in, with what it holds beside the screen: the page's state, the boxes, the tools, the chat. */
function Shell() {
  const host = useHost();
  const { pods, people, titles, held } = useApp();
  const table = useRouteLoaderData("table") as Read<TableAsked> | undefined;
  const tables = useLate(held);
  const { pathname, hash, key } = useLocation();
  useInPlace();
  const current = /\/pods\/([^/]+)/.exec(pathname)?.[1];
  const onTable = /^\/tables(\/|$)/.test(pathname);
  const tableId = /^\/tables\/([^/]+)/.exec(pathname)?.[1];
  const told = useRef(false);
  useLayoutEffect(() => {
    // The shell is drawn once the pods are read, after the browser matched `:target`, so a load at `#about` is told
    // again, once.
    if (told.current) return;
    told.current = true;
    if (/^#[^/]+$/.test(location.hash)) location.replace(location.hash);
  }, []);
  useLayoutEffect(() => {
    const open = document.querySelector(".dialog:target");
    if (open !== null && `#${open.id}` !== hash) closeBox();
  }, [key, hash]);
  const [model, setModel] = useState<{ named?: ChatModel }>();
  useEffect(() => {
    void host.chat?.model().then(
      (named) => setModel(named === undefined ? {} : { named }),
      () => setModel({}),
    );
  }, [host]);
  const names = useMemo(() => pods.map(({ name }) => name), [pods]);
  const shown = current === undefined ? undefined : decodeURIComponent(current);
  const known =
    shown !== undefined && names.includes(shown) ? shown : undefined;
  const Chat = host.chat?.Window;
  return (
    <ConfirmProvider>
      <PageState />
      <WebTools pod={known} />
      <AskProvider value={model?.named !== undefined}>
        <Layout
          pods={names}
          titles={titles}
          current={shown}
          table={onTable ? decodeURIComponent(tableId ?? "") : undefined}
          tables={
            table !== undefined && "value" in table
              ? { held: table.value.read.held, read: "read" }
              : (tables ?? { held: [] })
          }
          about={host.about}
          people={people}
          samples={host.samples}
          chat={
            Chat !== undefined &&
            model !== undefined && (
              <Suspense fallback={null}>
                <Chat model={model.named} pod={known ?? ""} />
              </Suspense>
            )
          }
        >
          <Outlet />
        </Layout>
      </AskProvider>
    </ConfirmProvider>
  );
}
