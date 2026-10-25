// What the screens read and write through: PodApi, over HTTP on the Node target and in the page in the browser one,
// and what only the host knows. A screen never knows which host it runs on.
import { createContext, useContext, type ComponentType } from "react";
import type {
  Answers,
  Checked,
  Failure,
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

/**
 * A pod's answers by question, the changes in them and the table versions it names that the app does not hold, those
 * undefined while not known, as for a copied pod drawn before the engine loads.
 */
export interface Answered {
  readonly answers: Answers;
  readonly changes: readonly Finding[];
  readonly unheld?: readonly string[];
}

/** What the tables say of a pod's codes and variants, as PodApi sends it: each `Map` as its pairs. */
export type SaidSent = Record<string, unknown>;

/** The operations the screens call so far; the rest come with the screens that call them. */
export interface PodApi extends WritesApi, HospitalsApi {
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

/** A hospital of the directory, as PodApi's `hospitals` lists it. */
export interface Hospital {
  readonly name: string;
  readonly vendor: string;
  readonly fhirBase: string;
  readonly places?: readonly string[];
}

/** Where a connection to a hospital has got to, as PodApi's `connection` says it. */
export interface ConnectionNow {
  readonly n: number;
  readonly row: Hospital;
  /** `signing in`, `pulling`, `pulled`, `bringing in` or `failed`. */
  readonly step: string;
  readonly settled: boolean;
  readonly requests: number;
  /** The world's date the pull was made under. */
  readonly asOf?: string;
  readonly bringing?: { part: string; done?: number; of?: number };
  /** The developer's sentence of why it stopped, and its `ConnectionFailure` kind when it has one. */
  readonly failed?: string;
  readonly failure?: string;
  readonly retry?: boolean;
  readonly sources?: readonly {
    records: Readonly<Record<string, number>>;
    claimed: boolean;
  }[];
  readonly pulled?: {
    readonly denied: readonly { type: string; category?: string }[];
    readonly missing: readonly string[];
  };
  readonly patient?: string;
  readonly patientNames?: readonly { name?: string; family?: string }[];
  /** Why the pod holds no record of the connect, when it does not. */
  readonly notRecorded?: string;
  readonly broughtIn?: boolean;
}

/** The operations of the hospitals and a connection's box. */
export interface HospitalsApi {
  hospitals(input: { q?: string }): Promise<{
    rows: Hospital[];
    asOf?: string;
  }>;
  connect(input: {
    pod: string;
    fhirBase: string;
  }): Promise<{ connection: number; authorize?: string }>;
  connection(input: {
    pod: string;
    connection: number;
    wait?: true | "change";
  }): Promise<ConnectionNow>;
  bring(input: { pod: string; connection: number }): Promise<{ step: string }>;
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
  /** The reads of the one list of tools that a model reaches by this host. */
  readonly reads: HostReads;
  /**
   * Opens the window a sign-in at a hospital goes on, in the click that asks for it, where the host signs in in one;
   * a host without it signs in on the hospital's own page in place of the app, which `connect`'s `authorize` names.
   * It returns what closes the window, for a `connect` the pod or the directory refuses before it signs in.
   */
  openSignIn?(): () => void;
  /** What this host says of a failed sign-in where its cause differs from the app's: a sentence by failure kind. */
  readonly failures?: Readonly<Record<string, Failure>>;
  /** The chat with a model, on a host that has one: the Node target's. */
  readonly chat?: HostChat;
}

/** A read of the one list of tools (`tools.ts`) as a host names it; `ofPod` for one that takes the pod's name. */
export interface ReadTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: object;
  readonly ofPod: boolean;
}

/** The reads a host runs for a model, where the host runs them: in the page, or at its server. */
export interface HostReads {
  list(): Promise<readonly ReadTool[]>;
  /** Runs the read `name` on `input`, which carries `pod` for one that takes it; a refusal rejects by name. */
  run(name: string, input: object): Promise<unknown>;
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

/** An error PodApi threw for an input the rules refused, told by its name: `Refusal`, or `Unopened` with its `outcome`. */
export const isRefusal = (error: unknown): error is Error =>
  error instanceof Error &&
  (error.name === "Refusal" || error.name === "Unopened");
