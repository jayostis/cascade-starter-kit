// "Ask about this": a button beside a thing a screen shows, which starts a chat about it. It is drawn only once the
// host's chat names a model; the chat window listens for its click, so a screen never knows the chat.
import { createContext, useContext } from "react";

/** What an "Ask about this" is about, by the thing's own key, never its text: the model reaches it through its tools. */
export type Asked =
  | { readonly kind: "finding"; readonly key: string }
  | { readonly kind: "entry"; readonly id: string }
  | { readonly kind: "worth"; readonly entry: string }
  | {
      readonly kind: "trend";
      readonly test: string;
      readonly medication?: string;
    };

const AskContext = createContext(false);

/** Whether the screens draw "Ask about this": true once the chat names a model. */
export const AskProvider = AskContext.Provider;

/** A button that starts a chat about `about`; `label` says which thing to a screen reader. Nothing without a model. */
export function AskButton({ about, label }: { about: Asked; label: string }) {
  if (!useContext(AskContext)) return null;
  return (
    <>
      {" "}
      <button
        type="button"
        className="quiet ask"
        data-ask={JSON.stringify(about)}
        data-ask-label={label}
        title="Ask about this"
        aria-label={`Ask about this: ${label}`}
      >
        <svg
          viewBox="0 0 24 24"
          width="1em"
          height="1em"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M21 12a8 8 0 0 1-11.6 7.1L3 20.5l1.5-4.9A8 8 0 1 1 21 12z" />
        </svg>
      </button>
    </>
  );
}
