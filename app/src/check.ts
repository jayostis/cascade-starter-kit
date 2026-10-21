import { refusal } from "../said.ts";

/** The part of JSON Schema the tools' inputs use. */
export interface Schema {
  readonly type?: string;
  readonly description?: string;
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly enum?: readonly unknown[];
  readonly minimum?: number;
  readonly maximum?: number;
}

export type Input = Record<string, unknown>;

/** Refuses, as the runtime's `checkInput` does, an `input` that `schema` does not allow. */
export function checkToolInput(
  schema: Schema,
  input: unknown,
): asserts input is Input {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw refusal("input must be an object");
  const given = input as Input;
  for (const name of schema.required ?? [])
    if (given[name] === undefined) throw refusal(`${name} is required`);
  for (const [name, value] of Object.entries(given)) {
    const property = Object.hasOwn(schema.properties ?? {}, name)
      ? schema.properties?.[name]
      : undefined;
    if (property === undefined) {
      if (schema.additionalProperties === false)
        throw refusal(`${name} is not an input of this tool`);
      continue;
    }
    if (property.type === "string" && typeof value !== "string")
      throw refusal(`${name} must be a string`);
    if (property.type === "integer" && !Number.isInteger(value))
      throw refusal(`${name} must be an integer`);
    if (property.enum !== undefined && !property.enum.includes(value))
      throw refusal(`${name} must be one of ${property.enum.join(", ")}`);
    if (typeof value === "number") {
      if (property.minimum !== undefined && value < property.minimum)
        throw refusal(`${name} must be at least ${property.minimum}`);
      if (property.maximum !== undefined && value > property.maximum)
        throw refusal(`${name} must be at most ${property.maximum}`);
    }
  }
}
