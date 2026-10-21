// The Node target's host: PodApi at the server's `/api/`, beside the app, and the chat at its `/chat`. The bundle
// carries the typed client only: no server code and no runtime.
import { lazy } from "react";
import type { Person } from "../../said.ts";
import type { ChatModel, Host, PodApi } from "../api.tsx";
import { remoteApi } from "./remote.ts";

const BASE = new URL(import.meta.env.BASE_URL, location.href);
const api: PodApi = remoteApi(BASE.href);

/** The model `GET /chat` names, or none when the server has none set. */
async function model(): Promise<ChatModel | undefined> {
  const response = await fetch(new URL("chat", BASE));
  if (!response.ok) return undefined;
  const named = (await response.json()) as Partial<ChatModel>;
  return typeof named.name === "string" ? (named as ChatModel) : undefined;
}

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
  chat: {
    model,
    Window: lazy(() =>
      import("../chat/window.tsx").then(({ ChatWindow }) => ({
        default: ChatWindow,
      })),
    ),
  },
};
