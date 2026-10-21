// The page's own ask before a write a model asked for: a box naming the action and its input, with Allow and Cancel,
// one at a time. Whoever offers a model a write (the chat, a browser agent's tools) awaits `confirm` and writes only on
// a yes.
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** What a model asks to do: the action in words, and the input it gave. */
export interface Asking {
  readonly action: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/**
 * Shows the person `asking` and resolves true on Allow, false on Cancel; asks made meanwhile wait their turn. An ask
 * whose `signal` aborts is withdrawn, from the box or from the queue, and resolves false.
 */
export type Confirm = (
  asking: Asking,
  signal?: AbortSignal,
) => Promise<boolean>;

/** What the person is asked to allow, for each write a page tool makes. */
export const ACTIONS: Readonly<Record<string, string>> = {
  make_pod: "Make a pod",
  check_tables: "Check the reference tables for newer versions",
  set_world_date: "Set the date the demo hospitals answer as of",
};

/** What the model is told when the person cancels a write. */
export const SAID_NO = "The person said no";

const ConfirmContext = createContext<Confirm | undefined>(undefined);

/** `confirm` for the calling component: its asks are withdrawn when it unmounts, so none outlives who asked. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (confirm === undefined)
    throw new Error("the app is drawn with no confirm box");
  const mounted = useRef(new AbortController());
  useEffect(() => {
    if (mounted.current.signal.aborted) mounted.current = new AbortController();
    return () => mounted.current.abort();
  }, []);
  return useCallback<Confirm>(
    (asking, signal) =>
      confirm(
        asking,
        signal === undefined
          ? mounted.current.signal
          : AbortSignal.any([mounted.current.signal, signal]),
      ),
    [confirm],
  );
}

interface Waiting {
  readonly asking: Asking;
  readonly answer: (allowed: boolean) => void;
}

const said = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value);

/** Gives `useConfirm` to `children`, and draws the box of the ask whose turn it is. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<readonly Waiting[]>([]);
  const confirm = useCallback<Confirm>(
    (asking, signal) =>
      new Promise((answer) => {
        if (signal?.aborted) return answer(false);
        const waiting = { asking, answer };
        signal?.addEventListener(
          "abort",
          () => {
            setQueue((now) => now.filter((each) => each !== waiting));
            answer(false);
          },
          { once: true },
        );
        setQueue((now) => (now.includes(waiting) ? now : [...now, waiting]));
      }),
    [],
  );
  const shown = queue[0];
  const answer = (allowed: boolean) => {
    if (shown === undefined) return;
    setQueue((now) => now.filter((each) => each !== shown));
    shown.answer(allowed);
  };
  const fields = Object.entries(shown?.asking.input ?? {});
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {shown !== undefined && (
        <div
          className="dialog asking"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="asking-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") answer(false);
          }}
        >
          <div className="box">
            <h2 id="asking-title">{shown.asking.action}?</h2>
            <p>A model asks to do this. Nothing is done unless you allow it.</p>
            {fields.length > 0 && (
              <dl className="facts">
                {fields.map(([name, value]) => (
                  <Fragment key={name}>
                    <dt>{name}</dt>
                    <dd>{said(value)}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
            <p className="row">
              <button type="button" onClick={() => answer(true)}>
                Allow
              </button>{" "}
              <button
                type="button"
                className="quiet"
                autoFocus
                onClick={() => answer(false)}
              >
                Cancel
              </button>
            </p>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
