## The tools a model reaches

`npm start`'s chat runs on the AI SDK: its server runs the free reads, and
offers the moves and the `ask` writes as tools the page runs, so a write waits
for the person.

## The commands

- `npm run model` asks which model a chat will use: Google Gemini, Groq or
  OpenRouter (each gives a free key from a sign-up page), Ollama or LM Studio
  on this computer, Anthropic, or another OpenAI-compatible address. It says
  what that provider does with what it is sent, makes one real request to
  check that the model calls a tool, and keeps the choice and the key in
  `.env` in this folder, which git ignores. A free hosted tier is for the
  example and story pods, not a person's own. Run it again to change the
  choice; `npm run model -- --off` removes it.

## The files

- `src/chat/`: the chat window, Node only, on
  [assistant-ui](https://www.assistant-ui.com) over the AI SDK's `useChat`.
- `server/chat.ts`: the chat's `/chat`, on the
  [Vercel AI SDK](https://ai-sdk.dev): `POST` answers with its UI message
  stream, and `GET` names the model. `server/main.ts` serves it when the file
  is there.
- `model.ts`, `models.ts`: `npm run model`, and the providers and the four
  settings, each provider through the AI SDK's own package for it:
  `@ai-sdk/anthropic`, `@ai-sdk/groq`, `@openrouter/ai-sdk-provider`, and
  `@ai-sdk/openai-compatible` for Gemini, Ollama, LM Studio and any other
  OpenAI-compatible address.
- `test/chat.test.ts`: the chat behind the server, with the AI SDK's mock
  model in place of a provider.

## Chat with the pods in the app

Run `npm run model` once, then `npm start`: every page has a chat window, made
with [assistant-ui](https://www.assistant-ui.com) over the
[Vercel AI SDK](https://ai-sdk.dev). Ask "find anything interesting" and it answers from the pod's records,
with the numbers of each change and the lab results behind it as a card under
the answer, and "Open the trend" draws it. Ask it to "open Ines Calloway's pod"
and the app goes there, with your chat open. Stop ends the model's answer. Chats are
kept by your browser, under the pod they are about, and an encrypted pod's are
kept nowhere. Each question goes to the
model you chose with the newest part of the chat (its last 24,000 characters)
and what its tools read from the pod. Without a model the
window only says to run `npm run model`. The chat reads, and moves the app; when
the model asks to make a pod, check the tables or move the world's date, the
page asks you first, and Cancel tells the model no. The chat is the Node
app's only: `npm run browser` has none.

An empty chat offers up to four questions worked out from the pod's own records
(not by a model), such as "Did LDL cholesterol change after atorvastatin 20 MG Oral Tablet
started?", and each What changed card, each trend and each entry has an "Ask
about this" button that opens a new chat about that one thing, named at the top
of the chat. The model is told to explain the thing, never the person.
