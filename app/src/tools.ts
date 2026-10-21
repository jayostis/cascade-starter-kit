// The tools a model reaches the pod shown by: offered while the address names the pod, and taken away as the address
// leaves it, in the commit that draws the next screen, never after the next paint.
import { useCallback, useLayoutEffect } from "react";
import { useNavigate } from "react-router";
import { routed } from "./address.tsx";
import { useHost } from "./api.tsx";
import { busy } from "./doing.ts";

/** Moves the app to the address a tool names. */
function useOpen() {
  const navigate = useNavigate();
  return useCallback(
    async (address: string) => {
      const to = new URL(address, location.href);
      busy("Opening…");
      void navigate(routed(to));
    },
    [navigate],
  );
}

/** Offers the host's tools for `pod` while it is the one shown. */
export function usePodTools(pod: string | undefined) {
  const { offer } = useHost();
  const open = useOpen();
  useLayoutEffect(
    () => (pod === undefined ? undefined : offer?.(pod, open)),
    [offer, pod, open],
  );
}
