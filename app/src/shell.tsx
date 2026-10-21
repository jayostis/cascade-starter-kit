// What every screen sits in: the title bar with its File and Help menus, the pods and the reference tables down the
// side, the screen in `main`, and the line that says what the page is doing.
import { useEffect, type ReactNode } from "react";
import {
  personName,
  sourcesOf,
  tableId,
  type Person,
  type Series,
} from "../said.ts";
import { useAddress } from "./address.tsx";
import type { About } from "./api.tsx";
import { useSaying } from "./doing.ts";
import { NewPod } from "./newpod.tsx";
import { muted, quiet, warm } from "./look.ts";
import { Box, Pending, PostButton } from "./parts.tsx";
import { currentSource } from "./tables.tsx";

/** What the reference tables down the side are: the series the app holds, or that they are still being read or failed. */
export interface TablesHeld {
  readonly held: readonly Series[];
  readonly read?: "read" | "failed";
}

const ASIDE_HEADING =
  "mt-0 mr-0 mb-2 ml-[0.6rem] text-[0.72rem] tracking-[0.08em] text-muted uppercase";
const SIDE_LIST = "m-0 mb-4 list-none p-0";
const SIDE_LINK =
  "block rounded-md px-[0.6rem] py-[0.4rem] text-text no-underline hover:bg-soft aria-[current]:bg-tint aria-[current]:font-semibold aria-[current]:text-accent";

/**
 * Closes the menus on a click outside them and on Escape, and on Escape follows the open box's own close link, as a
 * person expects of a menu and a box.
 */
function useClosing() {
  useEffect(() => {
    const closeMenus = (except?: Element | null) => {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>(
        "details.menu[open]",
      ))
        if (menu !== except) menu.open = false;
    };
    const click = (event: MouseEvent) =>
      closeMenus(
        (event.target as Element | null)?.closest?.("summary")?.parentElement,
      );
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      closeMenus();
      const close = document.querySelector<HTMLElement>(
        ".dialog:target .close",
      );
      if (close) close.click();
      else if (location.hash !== "") location.hash = "";
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, []);
}

function Menu({ name, items }: { name: string; items: [string, string][] }) {
  return (
    <details className="menu group relative text-[0.9rem]">
      <summary className="cursor-pointer list-none rounded-[5px] px-2 py-[0.1rem] group-open:bg-white/14 hover:bg-white/14 [&::-webkit-details-marker]:hidden">
        {name}
      </summary>
      <ul className="absolute top-[calc(100%+0.35rem)] left-0 z-10 m-0 min-w-44 list-none rounded-lg border border-line bg-panel p-[0.3rem] shadow-pop">
        {items.map(([href, label]) => (
          <li key={href}>
            <a
              className="block rounded-[5px] px-[0.7rem] py-[0.4rem] whitespace-nowrap text-text no-underline hover:bg-soft focus:bg-soft"
              href={href}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** File's two items each open a box asking to confirm; Help, About says what the app is and what it runs on. */
function MenuBoxes({ about }: { about: About }) {
  return (
    <>
      <Box id="delete-all" heading="Delete all data?">
        <p>Every pod in this app goes.</p>
        <PostButton
          intent="delete-all"
          className={warm}
          doing="Deleting all data…"
        >
          Delete all data
        </PostButton>
      </Box>
      <Box id="reset-all" heading="Reset all data?">
        <p>
          Every pod goes, and Alex's, Priya's, Martin's and Tamsin's are loaded
          again.
        </p>
        <PostButton
          intent="reset-all"
          className={warm}
          doing="Resetting all data…"
        >
          Reset all data
        </PostButton>
      </Box>
      <Box id="about" heading={`About ${about.name}`}>
        <p>
          <strong>{about.name}</strong> {about.version}
        </p>
        <p>Built on cascade-runtime {about.runtime}.</p>
        <p>Every person here is made up.</p>
        {about.code !== undefined && (
          <p>
            <a href={about.code}>The code</a>
          </p>
        )}
      </Box>
    </>
  );
}

/** The reference tables under the pods: each source the app holds, the one shown marked, and Check now. */
export function TablesNav({
  tables,
  current,
}: {
  tables: TablesHeld;
  current?: string;
}) {
  const address = useAddress();
  const sources = sourcesOf(tables.held);
  return (
    <section
      className="tables mt-7 border-t border-line pt-5"
      aria-label="Reference tables"
    >
      <h2 className={ASIDE_HEADING}>Reference tables</h2>
      {sources.length > 0 ? (
        <ul className={SIDE_LIST}>
          {sources.map((each) => (
            <li key={each.iri}>
              <a
                className={SIDE_LINK}
                href={address.table(tableId(each.iri))}
                aria-current={each.iri === current ? "page" : undefined}
              >
                {each.label}
              </a>
            </li>
          ))}
        </ul>
      ) : tables.read === "failed" ? (
        <p className={`${muted} mt-0 mr-0 mb-3 ml-2.5`}>
          The reference tables could not be read.
        </p>
      ) : tables.read === undefined ? (
        <Pending
          lines={6}
          pitch="2.34rem"
          said="Loading the reference tables…"
        />
      ) : (
        <p className={`${muted} mt-0 mr-0 mb-3 ml-2.5`}>None yet.</p>
      )}
      <PostButton
        intent="check-tables"
        block
        className={`${quiet} w-full`}
        doing="Checking the feeds…"
      >
        Check now
      </PostButton>
    </section>
  );
}

/** What a page says while it is busy: a spinner and one line; hidden while it is not. */
function Doing() {
  const said = useSaying();
  return (
    <p
      className="doing fixed top-2 left-1/2 z-30 m-0 flex -translate-x-1/2 items-center gap-[0.6rem] rounded-full border border-line bg-panel px-4 py-1.5 shadow-float"
      role="status"
      hidden={said === undefined}
    >
      <span
        className="spinner size-4 animate-spin-slow rounded-full border-2 border-line border-t-accent"
        aria-hidden="true"
      ></span>
      <span className="said">{said}</span>
    </p>
  );
}

/**
 * The page around a screen: `pods` by name, the one shown `current`, with the titles they were made under; `table`,
 * when the screen shown is a reference table's, its id in the address (empty for the first source); `people` and
 * `samples` for the new-pod box; `chat` at the foot of the page, on a host that has one.
 */
export function Layout({
  pods,
  titles,
  current,
  table,
  tables,
  about,
  people,
  samples,
  chat,
  children,
}: {
  chat?: ReactNode;
  pods: readonly string[];
  titles: ReadonlyMap<string, string>;
  current?: string;
  table?: string;
  tables: TablesHeld;
  about: About;
  people: readonly Person[];
  samples: readonly string[];
  children: ReactNode;
}) {
  const address = useAddress();
  useClosing();
  return (
    <>
      <header className="bar flex items-center gap-4 bg-bar px-5 py-[0.6rem] text-on-bar max-md:gap-2 max-md:px-4">
        <a
          className="font-semibold tracking-[0.02em] text-on-bar no-underline"
          href={address.home}
        >
          Cascade
        </a>
        <Menu
          name="File"
          items={[
            ["#delete-all", "Delete all data"],
            ["#reset-all", "Reset all data"],
          ]}
        />
        <Menu name="Help" items={[["#about", "About"]]} />
        <span className="demo ml-auto text-[0.8rem] opacity-75 max-md:text-right max-md:text-[0.72rem]">
          Demo: every person here is made up
        </span>
      </header>
      <div className="layout grid min-h-[calc(100vh-2.7rem)] grid-cols-[15rem_1fr] max-md:min-h-0 max-md:grid-cols-1">
        <aside className="border-r border-line bg-panel px-4 py-5 max-md:border-r-0 max-md:border-b">
          <nav>
            <h2 className={ASIDE_HEADING}>Pods</h2>
            <ul className={SIDE_LIST}>
              {pods.map((pod) => (
                <li key={pod}>
                  <a
                    className={SIDE_LINK}
                    href={address.pod(pod)}
                    aria-current={pod === current ? "page" : undefined}
                  >
                    {personName(pod, titles)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <a
            className="button block cursor-pointer rounded-[7px] border border-accent bg-accent px-4 py-[0.45rem] text-center text-on-accent no-underline"
            href="#new-pod"
          >
            + New pod
          </a>
          <TablesNav
            tables={tables}
            current={
              table === undefined
                ? undefined
                : currentSource(tables.held, table === "" ? undefined : table)
                    ?.iri
            }
          />
        </aside>
        <main className="max-w-[62rem] min-w-0 px-9 pt-7 pb-12 max-md:p-5">
          {children}
        </main>
      </div>
      {chat}
      <NewPod people={people} pods={pods} samples={samples} />
      <MenuBoxes about={about} />
      <Doing />
    </>
  );
}
