// The Node target's host: PodApi at the server's `/api/`, beside the app, and the chat at its `/chat` when the chat
// add-on is here. The bundle carries the typed client only: no server code and no runtime.
import { lazy } from "react";
import { type Person, refusal } from "../../said.ts";
import type { ChatModel, Host, HostChat, PodApi, ReadTool } from "../api.tsx";
import { remoteApi } from "./remote.ts";

const BASE = new URL(import.meta.env.BASE_URL, location.href);
const api: PodApi = remoteApi(BASE.href);
/** The chat add-on's window, found by Vite when it builds the app: none without the add-on, which then has no chat. */
const [chatWindow] = Object.values(
  import.meta.glob<{ ChatWindow: HostChat["Window"] }>("../chat/window.tsx"),
);

/** The model `GET /chat` names, or none when the server has none set. */
async function model(): Promise<ChatModel | undefined> {
  const response = await fetch(new URL("chat", BASE));
  if (!response.ok) return undefined;
  const named = (await response.json()) as Partial<ChatModel>;
  return typeof named.name === "string" ? (named as ChatModel) : undefined;
}

/** The reads of the one list, which the server runs at `/tools`: the bundle carries no runtime to run them. */
const reads: Host["reads"] = {
  async list() {
    const response = await fetch(new URL("tools", BASE));
    if (!response.ok)
      throw new Error(`the tool list answered ${response.status}`);
    return (await response.json()) as ReadTool[];
  },
  async run(name, input) {
    const response = await fetch(new URL(`tools/${name}`, BASE), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (response.ok) return response.json();
    const body = (await response.json().catch(() => ({}))) as {
      refused?: string;
    };
    throw body.refused === undefined
      ? new Error(`the tool ${name} answered ${response.status}`)
      : refusal(body.refused);
  },
};

/** The demo people the server's hospitals hold; none when they cannot be read. */
async function people(): Promise<Person[]> {
  try {
    const answer = await fetch(
      new URL(
        "demo-people.json",
        new URL(import.meta.env.BASE_URL, location.href),
      ),
    );
    return answer.ok ? ((await answer.json()) as Person[]) : [];
  } catch {
    return [];
  }
}

const { dataset } = document.body;

export const host: Host = {
  api,
  reads,
  about: {
    name: dataset.name ?? "",
    version: dataset.version ?? "",
    runtime: dataset.runtime ?? "",
    ...(dataset.code && { code: dataset.code }),
  },
  people,
  samples: [],
  firstVisit: async () => undefined,
  engine: async () => undefined,
  tables: async () => undefined,
  ...(chatWindow && {
    chat: {
      model,
      Window: lazy(() =>
        chatWindow().then(({ ChatWindow }) => ({ default: ChatWindow })),
      ),
    },
  }),
};
