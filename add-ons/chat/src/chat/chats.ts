// The chats this browser keeps, and what of one is sent. The chats are in `localStorage` (`cascade.chats`), each under
// the pod it is about; the open one's ID and whether the window is folded are in `sessionStorage`, for the tab. An
// encrypted pod's chat is kept in neither.
import type { UIMessage } from "ai";
import type { Asked } from "../ask.tsx";

const SAVED = "cascade.chats";
const OPEN = "cascade.chat.open";
const FOLDED = "cascade.chat.folded";
const ENTRIES = 30;

/** What the window says under a message that the model did not: the turn stopped, or no answer came. */
export interface Note {
  readonly kind: "stopped" | "failed";
  readonly text?: string;
}

/** A chat as it is kept: what it is about, its messages as the AI SDK made them, and the notes under them, by message. */
export interface Kept {
  readonly id: string;
  readonly pod: string;
  readonly title: string;
  readonly context?: Asked;
  readonly label?: string;
  readonly messages: readonly UIMessage[];
  readonly notes: Readonly<Record<string, Note>>;
  readonly updated: number;
  /** That it has been about an encrypted pod, so that it is never kept beyond the page. */
  readonly sealed?: true;
}

const storing = <T>(action: () => T): T | undefined => {
  try {
    return action();
  } catch {
    return undefined;
  }
};

const isKept = (each: unknown): each is Kept =>
  typeof each === "object" &&
  each !== null &&
  typeof (each as Kept).id === "string" &&
  Array.isArray((each as Kept).messages) &&
  (each as Kept).messages.every((message) => Array.isArray(message?.parts));

/** The chats kept in this browser; one kept in another shape (the old strip's) is left out. */
export function keptChats(): Kept[] {
  const saved: unknown = storing(() =>
    JSON.parse(localStorage.getItem(SAVED) ?? "[]"),
  );
  return Array.isArray(saved)
    ? saved.filter(isKept).map((each) => ({ ...each, notes: each.notes ?? {} }))
    : [];
}

/** `chats`, the newest first, keeping only those with a message, and at most `ENTRIES`. */
export const newestFirst = (chats: readonly Kept[]): Kept[] =>
  chats
    .filter((each) => each.messages.length > 0)
    .sort((a, b) => b.updated - a.updated)
    .slice(0, ENTRIES);

/** Keeps `chats` in this browser, and `open` as the tab's open chat, or none. */
export function keepChats(chats: readonly Kept[], open: string | undefined) {
  storing(() => {
    localStorage.setItem(SAVED, JSON.stringify(chats));
    if (open === undefined) sessionStorage.removeItem(OPEN);
    else sessionStorage.setItem(OPEN, open);
  });
}

export const openChat = () => storing(() => sessionStorage.getItem(OPEN));
export const forgetOpen = () => storing(() => sessionStorage.removeItem(OPEN));

export const isFolded = () =>
  storing(() => sessionStorage.getItem(FOLDED)) === "true";
export const keepFolded = (folded: boolean) =>
  storing(() => sessionStorage.setItem(FOLDED, String(folded)));

/** A new chat about `pod`, and about `context` when an "Ask about this" began it. */
export const fresh = (pod: string, context?: Asked, label?: string): Kept => ({
  id: Date.now().toString(36) + Math.random().toString(36).slice(2),
  pod,
  title: "",
  ...(context === undefined ? {} : { context, label: label ?? "" }),
  messages: [],
  notes: {},
  updated: Date.now(),
});

/** How much a message weighs, as the server counts it: a text part its text, any other part its JSON. */
const weightOf = ({ parts }: UIMessage) =>
  parts.reduce(
    (sum, part) =>
      sum +
      (part.type === "text" ? part.text.length : JSON.stringify(part).length),
    0,
  );

const answered = (state: unknown) =>
  state === "output-available" || state === "output-error";

/**
 * An earlier message as it is sent again: the person's as it is; the model's with its text and its answered tools,
 * its refusals and unanswered calls left out, or nothing when that leaves none.
 */
function again(message: UIMessage): UIMessage | undefined {
  if (message.role !== "assistant") return message;
  const parts = message.parts.filter(
    (part) =>
      part.type === "step-start" ||
      (part.type === "text" && part.text !== "") ||
      (part.type.startsWith("tool-") &&
        answered((part as { state?: unknown }).state)),
  );
  return parts.some((part) => part.type !== "step-start")
    ? { ...message, parts }
    : undefined;
}

/**
 * What of `messages` is sent: the last as it is (the person's question, or the model's turn with the page's answers
 * to its tools), after the newest earlier messages within `budget` characters, the first of them the person's, and at
 * most 100 in all.
 */
export function sent(
  messages: readonly UIMessage[],
  budget: number,
): UIMessage[] {
  const last = messages.at(-1);
  if (last === undefined) return [];
  const kept: UIMessage[] = [];
  let characters = 0;
  for (const message of messages.slice(0, -1).reverse()) {
    const sending = again(message);
    if (sending === undefined) continue;
    characters += weightOf(sending);
    if (characters > budget && kept.length > 0) break;
    kept.unshift(sending);
  }
  while (kept[0]?.role === "assistant") kept.shift();
  return [...kept, last].slice(-100);
}
