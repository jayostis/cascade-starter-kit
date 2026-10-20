// What every screen sits in: the title bar with its File and Help menus, the pods and the reference tables down the
// side, the screen in `main`, and the line that says what the page is doing.
import { useEffect, type ReactNode } from "react";
import { personName, sourcesOf, tableId, type Series } from "../said.ts";
import { useAddress } from "./address.tsx";
import type { About } from "./api.tsx";
import { useSaying } from "./doing.ts";
import { Box, Pending, PostButton } from "./parts.tsx";

/** What the reference tables down the side are: the series the app holds, or that they are still being read or failed. */
export interface TablesHeld {
  readonly held: readonly Series[];
  readonly read?: "read" | "failed";
}

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
    <details className="menu">
      <summary>{name}</summary>
      <ul>
        {items.map(([href, label]) => (
          <li key={href}>
            <a href={href}>{label}</a>
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
          action="delete-all"
          className="warm"
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
          action="reset-all"
          className="warm"
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
function TablesNav({
  tables,
  current,
}: {
  tables: TablesHeld;
  current?: string;
}) {
  const address = useAddress();
  const sources = sourcesOf(tables.held);
  return (
    <section className="tables" aria-label="Reference tables">
      <h2>Reference tables</h2>
      {sources.length > 0 ? (
        <ul>
          {sources.map((each) => (
            <li key={each.iri}>
              <a
                href={address.table(tableId(each.iri))}
                aria-current={each.iri === current ? "page" : undefined}
              >
                {each.label}
              </a>
            </li>
          ))}
        </ul>
      ) : tables.read === "failed" ? (
        <p className="muted">The reference tables could not be read.</p>
      ) : tables.read === undefined ? (
        <Pending
          lines={6}
          pitch="2.34rem"
          said="Loading the reference tables…"
        />
      ) : (
        <p className="muted">None yet.</p>
      )}
      <PostButton
        action="check-tables"
        className="quiet wide"
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
    <p className="doing" role="status" hidden={said === undefined}>
      <span className="spinner" aria-hidden="true"></span>
      <span className="said">{said}</span>
    </p>
  );
}

/** The page around a screen: `pods` by name, the one shown `current`, with the titles they were made under. */
export function Layout({
  pods,
  titles,
  current,
  tables,
  about,
  children,
}: {
  pods: readonly string[];
  titles: ReadonlyMap<string, string>;
  current?: string;
  tables: TablesHeld;
  about: About;
  children: ReactNode;
}) {
  const address = useAddress();
  useClosing();
  return (
    <>
      <header className="bar">
        <a href={address.home}>Cascade</a>
        <Menu
          name="File"
          items={[
            ["#delete-all", "Delete all data"],
            ["#reset-all", "Reset all data"],
          ]}
        />
        <Menu name="Help" items={[["#about", "About"]]} />
        <span className="demo">Demo: every person here is made up</span>
      </header>
      <div className="layout">
        <aside>
          <nav>
            <h2>Pods</h2>
            <ul>
              {pods.map((pod) => (
                <li key={pod}>
                  <a
                    href={address.pod(pod)}
                    aria-current={pod === current ? "page" : undefined}
                  >
                    {personName(pod, titles)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <a className="button wide" href="#new-pod">
            + New pod
          </a>
          <TablesNav tables={tables} />
        </aside>
        <main>{children}</main>
      </div>
      <MenuBoxes about={about} />
      <Doing />
    </>
  );
}
