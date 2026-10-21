// The tools a model reaches the pod shown by: offered while the address names the pod, and taken away as the address
// leaves it, in the commit that draws the next screen, never after the next paint.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { routed } from "./address.tsx";
import { useHost } from "./api.tsx";
import { busy } from "./doing.ts";

/** Moves the app to the address a tool names. `useNavigate` returns a new function at every pathname, so it is held in a ref: the tools are offered once per pod, not once per screen. */
function useOpen() {
  const navigate = useNavigate();
  const latest = useRef(navigate);
  useLayoutEffect(() => {
    latest.current = navigate;
  }, [navigate]);
  return useCallback(async (address: string) => {
    const to = new URL(address, location.href);
    busy("Opening…");
    void latest.current(routed(to));
  }, []);
}

/** The pod last read as open: a locked pod is offered no tool, as in try/. */
function useOpened(pod: string | undefined) {
  const { api } = useHost();
  const { pathname } = useLocation();
  const [opened, setOpened] = useState<string>();
  useEffect(() => {
    if (pod === undefined) return;
    let live = true;
    api.pod({ pod }).then(
      ({ locked }) => live && setOpened(locked === undefined ? pod : undefined),
      () => live && setOpened(undefined),
    );
    return () => {
      live = false;
    };
  }, [api, pod, pathname]);
  return opened;
}

/** Offers the host's tools for `pod` while it is the one shown and open. */
export function usePodTools(pod: string | undefined) {
  const { offer } = useHost();
  const open = useOpen();
  const opened = useOpened(pod);
  const offered = pod !== undefined && opened === pod ? pod : undefined;
  useLayoutEffect(
    () => (offered === undefined ? undefined : offer?.(offered, open)),
    [offer, offered, open],
  );
}
