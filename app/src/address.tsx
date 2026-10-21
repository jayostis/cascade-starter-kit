// The app's addresses under the base it was built for, and the one listener that moves the app to one in place.
import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { addresses, movesInPlace } from "../addresses.ts";
import { busy, landed } from "./doing.ts";

export const BASE = import.meta.env.BASE_URL;
const ADDRESS = addresses(BASE);

export const useAddress = () => ADDRESS;

/** The addresses as the router takes them, with no base. */
export const ROUTED = addresses("/");

/** The router's path of an address of this app: the part after the base, from `/`. */
export const routed = (url: URL) =>
  `/${url.pathname.slice(BASE.length)}${url.search}${url.hash}`;

let goes = 0;

/**
 * The state a step's own move to an address carries, so that the screen there is drawn again even at the same address;
 * `page` is this page's load, since the history keeps the state over a reload.
 */
export const goState = () => ({
  go: (goes += 1),
  page: performance.timeOrigin,
});

/** Whether a step of this page's load moved the app to the address whose history state is `state`. */
export const byStep = (state: unknown): boolean =>
  (state as { page?: number } | null)?.page === performance.timeOrigin;

/**
 * How many times a step has moved the app: it changes with the location a step moves to, never with a `#…` link, so a
 * screen that reads its data again when it does is read again for a step that leaves the address as it was.
 */
export function useGeneration(): number {
  const made = (useLocation().state as { go?: number } | null)?.go;
  const kept = useRef(0);
  if (made !== undefined) kept.current = made;
  return kept.current;
}

/**
 * Says the page is busy when the address changes under a screen with nothing said yet: at a Back or Forward as it
 * leaves, and at any other move in the commit that draws the new address, before the screen's own effects run, so that
 * the page is not ready for a screen that is still being drawn. The commit that draws a step's own move tells the step
 * it has landed, in the same layout phase, so that only screens drawn there say the step is done.
 */
export function useOpening() {
  const { pathname, search, state, key } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    const here = location.pathname + location.search;
    const leaving = () => {
      if (location.pathname + location.search !== here) busy("Opening…");
    };
    window.addEventListener("popstate", leaving);
    return () => window.removeEventListener("popstate", leaving);
  }, [pathname, search]);
  useLayoutEffect(() => {
    if (first.current) first.current = false;
    else if (document.body.dataset.state === "ready") busy("Opening…");
  }, [pathname, search]);
  useLayoutEffect(
    () => landed((state as { go?: number } | null)?.go, pathname + search),
    [key, pathname, search, state],
  );
}

/**
 * A click on a link to a screen of this app goes there without leaving the page, saying `opening(url)` while it does;
 * the address already shown is drawn again in its place in the history, not after it. A `#…` link is the browser's,
 * which opens and closes the boxes; so is a download, a link to another window, a file and a modified click.
 */
export function useInPlace(opening: (url: URL) => string) {
  const navigate = useNavigate();
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (link === null || link === undefined || event.defaultPrevented) return;
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const href = link.getAttribute("href") ?? "";
      const to = new URL(href, location.href);
      if (
        href.startsWith("#") ||
        !movesInPlace(
          {
            target: link.getAttribute("target") ?? "",
            download: link.hasAttribute("download"),
          },
          to,
          new URL(location.href),
          BASE,
        )
      )
        return;
      event.preventDefault();
      const same =
        to.pathname === location.pathname && to.search === location.search;
      if (!same) busy(opening(to));
      navigate(routed(to), { replace: same });
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [navigate, opening]);
}
