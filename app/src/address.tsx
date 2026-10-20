// The app's addresses under the base it was built for, and the one listener that moves the app to one in place.
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { addresses } from "../addresses.ts";
import { busy } from "./doing.ts";

export const BASE = import.meta.env.BASE_URL;
const ADDRESS = addresses(BASE);

export const useAddress = () => ADDRESS;

/** The router's path of an address of this app: the part after the base, from `/`. */
export const routed = (url: URL) =>
  `/${url.pathname.slice(BASE.length)}${url.search}${url.hash}`;

/**
 * A click on a link to an address of this app goes there without leaving the page, saying `opening(url)` while it
 * does; the address already shown is drawn again in its place in the history, not after it. A `#…` link is the
 * browser's, which opens and closes the boxes.
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
        event.shiftKey
      )
        return;
      const href = link.getAttribute("href") ?? "";
      const to = new URL(href, location.href);
      if (
        href.startsWith("#") ||
        to.origin !== location.origin ||
        !to.pathname.startsWith(BASE)
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
