// The pieces every screen draws with: a box over the page opened by the address's hash, a part still to come, a tag,
// and a button that is a form of its own.
import { useEffect, type FormEvent, type ReactNode } from "react";
import { Form } from "react-router";
import { TAGS } from "../said.ts";
import { useHere } from "./address.tsx";
import { tag as tagLook, tagWarm } from "./look.ts";

let closing = false;

if (typeof window !== "undefined")
  window.addEventListener(
    "popstate",
    (event) => {
      if (closing) event.stopImmediatePropagation();
    },
    { capture: true },
  );

/**
 * Closes the box open by the address's hash, as its close link does, so that what a step shows is not hidden behind it.
 * A box the browser opened stays open after a move that drops the hash from the address, so it is closed too. The
 * router never hears of it: the screen and what a step said on it stay as they are.
 */
export function closeBox() {
  if (location.hash === "" && document.querySelector(":target") === null)
    return;
  const { state } = history;
  closing = true;
  try {
    location.replace("#");
    history.replaceState(state, "", location.pathname + location.search);
  } finally {
    closing = false;
  }
}

/**
 * Opens the box the address's hash names, once the screen holding it is drawn: the browser matches `:target` when it
 * goes to an address, not for an element drawn after, as when the page is loaded at `#<id>` or Back returns to it.
 */
export function useReopenedBox(screen: string) {
  useEffect(() => {
    const { hash } = location;
    if (hash.length > 1 && document.getElementById(hash.slice(1)) !== null)
      location.replace(hash);
  }, [screen]);
}

/**
 * A box over the page, shown when the page's address ends `#<id>`, with `children` under `heading`; its close link and
 * backdrop go to `back`, and a `wide` one is for a table.
 */
export function Box({
  id,
  heading,
  back = "#",
  wide = false,
  children,
}: {
  id: string;
  heading: ReactNode;
  back?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="dialog fixed inset-0 z-20 hidden place-items-center overflow-auto bg-black/45 p-4 target:grid"
      id={id}
      role="dialog"
      aria-labelledby={`${id}-title`}
    >
      <a
        className="backdrop fixed inset-0"
        href={back}
        aria-label="Close the box"
        tabIndex={-1}
      ></a>
      <div
        className={`box relative w-full rounded-xl bg-panel px-7 py-6 shadow-modal ${wide ? "wide max-w-[44rem]" : "max-w-[34rem]"}`}
      >
        <a
          className="close float-right text-[1.4rem] leading-none text-muted no-underline"
          href={back}
          aria-label="Close"
        >
          ×
        </a>
        <h2 id={`${id}-title`}>{heading}</h2>
        {children}
      </div>
    </div>
  );
}

/** A part that has not arrived: `lines` faint bars hold its space, `pitch` apart, and `said` is what a screen reader reads. */
export function Pending({
  lines,
  said,
  pitch,
}: {
  lines: number;
  said: string;
  pitch?: string;
}) {
  return (
    <div
      className="pending"
      aria-busy="true"
      style={pitch === undefined ? undefined : ({ "--pitch": pitch } as object)}
    >
      <p role="status">{said}</p>
      {Array.from({ length: lines }, (_, at) => (
        <span key={at}></span>
      ))}
    </div>
  );
}

/** A tag as it is drawn, after a line, a row's name or an entry's heading. */
export function Tag({ tag }: { tag: string }) {
  return (
    <>
      {" "}
      <span
        className={
          TAGS.find((each) => each.tag === tag)?.warm ? tagWarm : tagLook
        }
      >
        {tag}
      </span>
    </>
  );
}

/**
 * What a step's form posts beside its own fields: the step, `intent`, which the route's action runs, and what the
 * page says while it does, `doing`.
 */
export function StepFields({
  intent,
  doing,
  fields = {},
}: {
  intent: string;
  doing: string;
  fields?: Readonly<Record<string, string>>;
}) {
  return (
    <>
      {Object.entries({ intent, doing, ...fields }).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

/**
 * A step's form, posting to the route of the address shown, whose action runs it; `onSubmit` runs first, in the
 * click, for what must happen there (a window the browser opens only in a click).
 */
export function StepForm({
  className,
  onSubmit,
  children,
  ...attributes
}: {
  className?: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  autoComplete?: string;
  children: ReactNode;
}) {
  const here = useHere();
  return (
    <Form
      method="post"
      action={here}
      className={className}
      onSubmit={onSubmit}
      {...attributes}
    >
      {children}
    </Form>
  );
}

/** A button that is a step's form of its own: `intent` with `fields`, saying `doing` while it runs. */
export function PostButton({
  intent,
  fields,
  className,
  block = false,
  doing,
  onSubmit,
  children,
}: {
  intent: string;
  fields?: Readonly<Record<string, string>>;
  className?: string;
  block?: boolean;
  doing: string;
  onSubmit?: () => void;
  children: ReactNode;
}) {
  return (
    <StepForm className={block ? "block" : "inline"} onSubmit={onSubmit}>
      <StepFields intent={intent} doing={doing} fields={fields} />
      <button className={className}>{children}</button>
    </StepForm>
  );
}
