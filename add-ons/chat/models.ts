// The model the chat uses, through the AI SDK's provider packages: `modelFrom` reads the four settings `npm run model`
// keeps in `.env`, and `modelOf` makes a `Model` of any provider. No property of a `Model` shows its key or address.
import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  APICallError,
  defaultSettingsMiddleware,
  type LanguageModel,
  RetryError,
  StreamProviderError,
  wrapLanguageModel,
} from "ai";
import { Refusal } from "cascade-runtime";

/** Where `npm run model` keeps its settings, beside this module. */
export const ENV_FILE = fileURLToPath(new URL(".env", import.meta.url));
/** The four settings, in the order they are written. */
export const SETTINGS = [
  "CASCADE_MODEL_PROVIDER",
  "CASCADE_MODEL_URL",
  "CASCADE_MODEL_NAME",
  "CASCADE_MODEL_KEY",
] as const;

export interface Provider {
  readonly label: string;
  readonly summary: string;
  /** The default model. */
  readonly name: string | undefined;
  /** The default address. */
  readonly url: string | undefined;
  /** The page where a key is made; none when the provider needs no key. */
  readonly key: string | undefined;
  /** What happens to what is sent. */
  readonly data: string;
}

const FREE_ONLY_FOR_STORIES =
  "Use it for the example and story pods, not a person's own.";

/** The providers a person can choose, in the order they are offered. */
export const PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    summary: "free key, no card",
    name: "gemini-3.5-flash",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/",
    key: "https://aistudio.google.com/apikey",
    data: `Google uses the free tier to improve its products, and people may read what is sent. ${FREE_ONLY_FOR_STORIES} Google's terms allow only the paid tier for people in the EEA, Switzerland and the UK: there, choose Groq or a model on this computer.`,
  },
  groq: {
    label: "Groq",
    summary: "free key, no card",
    name: "openai/gpt-oss-120b",
    url: "https://api.groq.com/openai/v1",
    key: "https://console.groq.com/keys",
    data: `Groq does not train on what is sent (Groq Services Agreement, section 4.2) and may log it for up to 30 days. ${FREE_ONLY_FOR_STORIES}`,
  },
  openrouter: {
    label: "OpenRouter",
    summary: "free models, about 50 questions a day",
    name: "google/gemma-4-31b-it:free",
    url: "https://openrouter.ai/api/v1",
    key: "https://openrouter.ai/keys",
    data: `What happens to what is sent depends on the model's provider, and a free model may log and train on it. ${FREE_ONLY_FOR_STORIES}`,
  },
  local: {
    label: "On this computer",
    summary: "Ollama or LM Studio",
    name: "qwen3.5:4b",
    url: "http://localhost:11434/v1",
    key: undefined,
    data: "Nothing leaves this machine.",
  },
  anthropic: {
    label: "Anthropic",
    summary: "paid, best at calling tools",
    name: "claude-haiku-5-5",
    url: "https://api.anthropic.com",
    key: "https://platform.claude.com/settings/keys",
    data: "A paid API: Anthropic's terms for the API apply to what is sent.",
  },
  other: {
    label: "Another OpenAI-compatible address",
    summary: "you give the address",
    name: undefined,
    url: undefined,
    key: undefined,
    data: "Not known: treated as a hosted provider unless the address is on this computer.",
  },
} as const satisfies Record<string, Provider>;

export type ProviderName = keyof typeof PROVIDERS;

const isProvider = (name: string): name is ProviderName =>
  Object.hasOwn(PROVIDERS, name);

/** A provider whose servers are not this computer's, so a key is needed. */
export const isHosted = (provider: string) =>
  isProvider(provider) && provider !== "local" && provider !== "other";

/** A model server on this computer, whatever its port: 127.0.0.0/8, ::1 or localhost. */
export function isLoopback(address: string): boolean {
  let host;
  try {
    host = new URL(address).hostname.toLowerCase();
  } catch {
    return false;
  }
  host = host.replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    /^127(\.\d{1,3}){3}$/.test(host)
  );
}

/** The text with every occurrence of the key replaced, so a provider echoing it back shows nothing. */
export function redact(text: unknown, key: string | undefined): string {
  const said = String(text);
  return key ? said.replaceAll(key, "[key]") : said;
}

const KEYED = /\b(api[ _-]?key|auth(entication)? key)\b/i;

/** What a person can do about a refused key or a busy model, in place of the provider's own reply; nothing else changes. */
function advice(
  status: number | undefined,
  message: string,
  { provider, name }: { provider: ProviderName; name: string },
) {
  const label =
    provider === "other" || provider === "local"
      ? "The model server"
      : PROVIDERS[provider].label;
  if (
    status === 401 ||
    status === 403 ||
    (status === 400 && KEYED.test(message))
  )
    return `${label} rejected the key: check CASCADE_MODEL_KEY in .env, or run \`npm run model\` again. ${message}`;
  if (status === 429 || status === 503 || status === 529)
    return `${name} is busy at ${label} (${status}): try again in a minute, or choose another model with \`npm run model\``;
  return message;
}

export interface Settings {
  readonly provider: string;
  readonly url?: string | undefined;
  readonly name?: string | undefined;
  readonly key?: string | undefined;
}

export interface Model {
  readonly provider: string;
  readonly name: string;
  /** Whether the model's address is on this computer. */
  readonly local: boolean;
  /** The AI SDK's model, to call. */
  language(): LanguageModel;
  /**
   * What went wrong with a call to the model, in words a person can act on, with neither key nor address in them;
   * nothing when `error` is not the model's.
   */
  failure(error: unknown): string | undefined;
}

/**
 * The call's failure, unwrapped from the SDK's retries: the provider's reply or the network's, or the error the
 * provider sent in the middle of the stream (Anthropic's `overloaded_error`, an OpenAI-compatible `{ error }` chunk).
 */
function callFailure(
  error: unknown,
): APICallError | StreamProviderError | undefined {
  const failed = RetryError.isInstance(error) ? error.lastError : error;
  return APICallError.isInstance(failed) ||
    StreamProviderError.isInstance(failed)
    ? failed
    : undefined;
}

/** Anthropic's API asks for a bound on each answer; the others are left their own. */
const ANTHROPIC_MAX_TOKENS = 4096;

function languageOf(
  provider: ProviderName,
  { url, name, key }: { url: string; name: string; key: string | undefined },
): LanguageModel {
  const apiKey = key ?? "";
  switch (provider) {
    case "anthropic":
      return wrapLanguageModel({
        model: createAnthropic({
          baseURL: `${url.replace(/\/+$/, "")}/v1`,
          apiKey,
        })(name),
        middleware: defaultSettingsMiddleware({
          settings: { maxOutputTokens: ANTHROPIC_MAX_TOKENS },
        }),
      });
    case "groq":
      return createGroq({ baseURL: url, apiKey })(name);
    case "openrouter":
      return createOpenRouter({ baseURL: url, apiKey }).chat(name);
    default:
      return createOpenAICompatible({
        name: provider,
        baseURL: url,
        ...(key === undefined ? {} : { apiKey: key }),
        ...(provider === "gemini"
          ? {}
          : {
              transformRequestBody: (body: Record<string, unknown>) => ({
                ...body,
                chat_template_kwargs: { enable_thinking: false },
              }),
            }),
      }).chatModel(name);
  }
}

/**
 * A `Model` of the provider at `url`, named `name`, with `key`. An unknown provider is a `Refusal`; a missing address
 * or name falls back to the provider's default, and `other` has none.
 */
export function modelOf({ provider, url, name, key }: Settings): Model {
  if (!isProvider(provider))
    throw new Refusal(
      `unknown model provider "${provider}": use ${Object.keys(PROVIDERS).join(", ")}, or run \`npm run model\``,
    );
  const known: Provider = PROVIDERS[provider];
  const address = url || known.url;
  const named = name || known.name;
  if (!address)
    throw new Refusal(
      `the provider ${provider} needs an address: set CASCADE_MODEL_URL, or run \`npm run model\``,
    );
  if (!named)
    throw new Refusal(
      `the provider ${provider} needs a model name: set CASCADE_MODEL_NAME, or run \`npm run model\``,
    );
  const language = languageOf(provider, {
    url: address,
    name: named,
    key: key || undefined,
  });
  return Object.freeze({
    provider,
    name: named,
    local: isLoopback(address),
    language: () => language,
    failure(error: unknown) {
      const failed = callFailure(error);
      if (failed === undefined) return undefined;
      let message = failed.message;
      let reason;
      for (
        let cause = failed.cause as
          { code?: string; message?: string; cause?: unknown } | undefined;
        cause;
        cause = cause.cause as typeof cause
      )
        reason = cause.code || cause.message || reason;
      if (reason && !message.includes(reason)) message += ` (${reason})`;
      return redact(
        advice(failed.statusCode, message, { provider, name: named }),
        key,
      ).replaceAll(address, "[the model's address]");
    },
  });
}

/**
 * The model the settings name, or nothing when `CASCADE_MODEL_PROVIDER` is unset. With the process's own environment,
 * `.env` beside this module is loaded first when it exists (a variable already set wins).
 *
 * @throws Refusal for settings that make no model: an unknown provider, a hosted one with no key, other settings
 * with no provider.
 */
export function modelFrom(
  env: Record<string, string | undefined> = process.env,
): Model | undefined {
  if (env === process.env && existsSync(ENV_FILE))
    process.loadEnvFile(ENV_FILE);
  const provider = env.CASCADE_MODEL_PROVIDER;
  if (!provider) {
    if (SETTINGS.some((name) => env[name]))
      throw new Refusal(
        "CASCADE_MODEL_PROVIDER is not set, though other model settings are: run `npm run model`",
      );
    return undefined;
  }
  const key = env.CASCADE_MODEL_KEY || undefined;
  if (isHosted(provider) && !key)
    throw new Refusal(
      `CASCADE_MODEL_KEY is not set for ${provider}: run \`npm run model\``,
    );
  return modelOf({
    provider,
    url: env.CASCADE_MODEL_URL,
    name: env.CASCADE_MODEL_NAME,
    key,
  });
}
