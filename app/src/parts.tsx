// The pieces every screen draws with: a box over the page opened by the address's hash, a part still to come, a tag,
// and a button that is a form of its own.
import type { ReactNode } from "react";
import { TAGS } from "../said.ts";

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
      className="dialog"
      id={id}
      role="dialog"
      aria-labelledby={`${id}-title`}
    >
      <a
        className="backdrop"
        href={back}
        aria-label="Close the box"
        tabIndex={-1}
      ></a>
      <div className={`box${wide ? " wide" : ""}`}>
        <a className="close" href={back} aria-label="Close">
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
        className={`tag${TAGS.find((each) => each.tag === tag)?.warm ? " warm" : ""}`}
      >
        {tag}
      </span>
    </>
  );
}

/**
 * A button that is a form of its own, posting `fields` to `action`; `doing` is what the page says while it acts. It
 * does `onPost` with the fields when it has one; a button whose action comes with a later screen does nothing until
 * then.
 */
export function PostButton({
  action,
  fields = {},
  className,
  doing,
  onPost,
  children,
}: {
  action: string;
  fields?: Record<string, string>;
  className?: string;
  doing?: string;
  onPost?: (fields: FormData) => void;
  children: ReactNode;
}) {
  return (
    <form
      className="inline"
      method="post"
      action={action}
      data-doing={doing}
      onSubmit={(event) => {
        event.preventDefault();
        onPost?.(new FormData(event.currentTarget));
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button className={className}>{children}</button>
    </form>
  );
}
