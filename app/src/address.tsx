// The app's addresses under the base it was built for, and the one listener that moves the app to one in place.
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { addresses, movesInPlace } from "../addresses.ts";

export const BASE = import.meta.env.BASE_URL;
export const ADDRESS = addresses(BASE);

export const useAddress = () => ADDRESS;

/** The addresses as the router takes them, with no base. */
export const ROUTED = addresses("/");

/** The router's path of an address of this app: the part after the base, from `/`. */
export const routed = (url: URL) =>
  `/${url.pathname.slice(BASE.length)}${url.search}${url.hash}`;

/** The router's path of the address shown, its hash kept: where a step's form posts, so that it stays on its screen. */
export function useHere(): string {
  const { pathname, search, hash } = useLocation();
  return pathname + search + hash;
}

/**
 * A click on a link to a screen of this app goes there without leaving the page; the address already shown is read
 * again in its place in the history, not after it. A `#…` link is the browser's, which opens and closes the boxes; so
 * is a download, a link to another window, a file and a modified click.
 */
export function useInPlace() {
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
      void navigate(routed(to), { replace: same });
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [navigate]);
}
