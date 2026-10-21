// What each PodApi operation may be sent over `/api`: its fields' types, checked at the route before PodApi runs. The
// route checks shape only; PodApi still checks meaning, and `typed` in `pod-api.ts` for the browser, which has no
// route. A refusal reads as PodApi's own: `<field> must be <what>`.
import { z } from "zod";

const string = z.string({ error: "a string" });
const boolean = z.boolean({ error: "true or false" });
const positiveInteger = z
  .int({ error: "a whole number from 1" })
  .positive({ error: "a whole number from 1" });
const object = z.custom<Record<string, unknown>>(
  (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value),
  { error: "an object" },
);
const waitFor = z.union([z.literal(true), z.literal("change")], {
  error: 'true or "change"',
});

const input = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.looseObject(shape, { error: "the input must be an object" }).partial();

export const INPUTS = {
  pods: input({}),
  held: input({}),
  pod: input({ pod: string }),
  answers: input({ pod: string }),
  said: input({ pod: string, entry: string }),
  trend: input({
    pod: string,
    test: string,
    medication: string,
    named: boolean,
  }),
  classes: input({ pod: string }),
  panel: input({ pod: string, panel: string }),
  table: input({ id: string, q: string, page: positiveInteger, code: string }),
  ask: input({ pod: string, question: string, limit: positiveInteger }),
  tool: input({ pod: string, tool: string, input: object }),
  makePod: input({ person: string, encrypt: boolean }),
  waitingWords: input({ pod: string }),
  confirmWords: input({
    pod: string,
    word2: string,
    word5: string,
    password: string,
    username: string,
  }),
  unlock: input({ pod: string, secret: string }),
  deleteAll: input({}),
  resetAll: input({}),
  checkTables: input({}),
  setWorldDate: input({ date: string }),
  hospitals: input({ q: string }),
  connect: input({ pod: string, fhirBase: string }),
  connection: input({
    pod: string,
    connection: positiveInteger,
    wait: waitFor,
  }),
  bring: input({ pod: string, connection: positiveInteger }),
};

export type Operation = keyof typeof INPUTS;

/** Only the fields a schema names: its `looseObject` lets the server take others, but a caller may not send them. */
type Named<T> = { [P in keyof T as string extends P ? never : P]: T[P] };

/** What `operation` may be sent, as its route's schema says. */
export type Input<K extends Operation> = Named<z.input<(typeof INPUTS)[K]>>;

/** The sentence an input the schema refused is refused with, PodApi's own for the same input. */
export function refusalOf(error: {
  readonly issues: readonly {
    readonly path: readonly PropertyKey[];
    readonly message: string;
  }[];
}): string {
  const [issue] = error.issues;
  if (issue === undefined) return "the input must be an object";
  const [field] = issue.path;
  return field === undefined
    ? issue.message
    : `${String(field)} must be ${issue.message}`;
}
