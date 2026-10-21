// What the screens read and write through: PodApi, over HTTP on the Node target and in the page in the browser one,
// and what only the host knows. A screen never knows which host it runs on.
import { createContext, useContext, type ComponentType } from "react";
import type {
  Answers,
  Checked,
  Finding,
  Person,
  Row,
  Series,
} from "../said.ts";
import type { TableRead } from "./tables.tsx";

/** A pod there is, by name, with the name it was made under. */
export interface PodListed {
  readonly name: string;
  readonly title: string;
}

/** A pod's answers by question, the changes in them and the table versions it names that the app does not hold. */
export interface Answered {
  readonly answers: Answers;
  readonly changes: readonly Finding[];
  readonly unheld?: readonly string[];
}

/** What the tables say of a pod's codes and variants, as PodApi sends it: each `Map` as its pairs. */
export type SaidSent = Record<string, unknown>;

/** The operations the screens call so far; the rest come with the screens that call them. */
export interface PodApi extends WritesApi {
  pods(input?: object): Promise<{ pods: PodListed[] }>;
  held(input?: object): Promise<{ held: Series[]; failed?: boolean }>;
  pod(input: { pod: string }): Promise<{
    name: string;
    title: string;
    encrypted: boolean;
    locked?: string;
  }>;
  answers(input: { pod: string }): Promise<Answered>;
  said(input: { pod: string; entry?: string }): Promise<SaidSent>;
  trend(input: {
    pod: string;
    test?: string;
    medication?: string;
    named?: boolean;
  }): Promise<SaidSent>;
  classes(input: { pod: string }): Promise<SaidSent>;
  panel(input: { pod: string; panel?: string }): Promise<SaidSent>;
  makePod(input: {
    person: string;
    encrypt?: boolean;
  }): Promise<{ pod: string; waiting?: boolean }>;
  ask(input: {
    pod: string;
    question: string;
    limit?: number;
  }): Promise<{ question: string; total: number; rows: Row[] }>;
  setWorldDate(input: { date: string }): Promise<{ asOf?: string }>;
}

/** The operations of the tables screens, the new-pod box, the six words, the unlock screen and the File menu. */
export interface WritesApi {
  table(input: {
    id?: string;
    q?: string;
    page?: number;
    code?: string;
  }): Promise<TableRead>;
  checkTables(input?: object): Promise<{
    checked: Checked[];
    held: Series[];
  }>;
  waitingWords(input: {
    pod: string;
  }): Promise<{ pod: string; person: string; words: string }>;
  confirmWords(input: {
    pod: string;
    word2: string;
    word5: string;
    password: string;
    username: string;
  }): Promise<{ pod: string; made: boolean }>;
  unlock(input: {
    pod: string;
    secret: string;
  }): Promise<{ pod: string; opened: boolean }>;
  deleteAll(input?: object): Promise<{ deleted: string[] }>;
  resetAll(input?: object): Promise<{ pods: string[] }>;
}

/** What the About box says: the app, its version, the cascade-runtime it runs and where its code is. */
export interface About {
  readonly name: string;
  readonly version: string;
  readonly runtime: string;
  readonly code?: string;
}

/** The host the app runs on: its PodApi and what only it knows. */
export interface Host {
  readonly api: PodApi;
  readonly about: About;
  /** The demo people, as `demoPeople` gives them; none where the host has not said. */
  people(): Promise<Person[]>;
  /** The sample pods, by name, that the new-pod box offers to load; none on a host that has none. */
  readonly samples: readonly string[];
  /** Copies the samples into a browser that has no pod; nothing on a host that has none to copy. */
  firstVisit(): Promise<void>;
  /** Resolves once the engine can say what the tables say, rejecting when it cannot. */
  engine(): Promise<void>;
  /** Resolves once the tables are kept up to date. */
  tables(): Promise<void>;
  /**
   * Offers a model the free tools for the pod shown, `open` moving the app to an address; the function it returns takes
   * them away. A host with no model context offers none.
   */
  offer?(pod: string, open: (address: string) => Promise<void>): () => void;
  /** The chat with a model, on a host that has one: the Node target's. */
  readonly chat?: HostChat;
}

/** The model a chat talks to, as the host names it: never its address or key. */
export interface ChatModel {
  readonly provider: string;
  readonly name: string;
  readonly local: boolean;
}

/** A host's chat: the model it was set up with, none when none is, and the window, loaded when it is first drawn. */
export interface HostChat {
  model(): Promise<ChatModel | undefined>;
  readonly Window: ComponentType<{
    model: ChatModel | undefined;
    pod: string;
  }>;
}

const HostContext = createContext<Host | undefined>(undefined);

export const HostProvider = HostContext.Provider;

export function useHost(): Host {
  const host = useContext(HostContext);
  if (host === undefined) throw new Error("the app is drawn with no host");
  return host;
}

/** PodApi, as the host gives it. */
export const usePodApi = (): PodApi => useHost().api;

/** An error PodApi threw for an input the rules refused, told by its name: `Refusal`, or `Unopened` with its `outcome`. */
export const isRefusal = (error: unknown): error is Error =>
  error instanceof Error &&
  (error.name === "Refusal" || error.name === "Unopened");
