## The starter

- `npm run model [-- --off]` asks which model the app's chat uses (a free
  hosted key, a model on this computer, or a paid one), checks that it calls a
  tool and keeps the choice, key included, in the app's untracked `.env`.
  `--off` removes it. Without `.env` the app runs with the chat off.

## The chat

The chat add-on gives the Node target a chat with a model on every page. Its files are `server/chat.ts`, `models.ts`,
`model.ts`, `src/chat/` and `test/chat.test.ts`; the base finds it by its files alone: `server/main.ts` serves
`chatServed(api)` of `server/chat.ts` at `/chat` when that file is there, and `src/hosts/http.ts` draws the window when
Vite finds `src/chat/window.tsx` (`import.meta.glob`). Delete those files and the dependencies the add-on added, and
the app is the base again.

`server/chat.ts`, `npm start`'s `/chat`, runs on the Vercel AI SDK (`ai`): `chatTools(api)` offers every tool of the
list, the free reads with a server `execute` and the navigation and `ask` tools with none, so a call to one ends the
server's turn and the page runs it. `POST /chat` takes the SDK's `messages` beside `pod`, `page` and `context`, answers
with the SDK's UI message stream, stops after `MAX_ROUNDS` rounds of tool calls, and says the model's refusal as a
`data-refused` part; `GET /chat` gives the model's `{ provider, name, local }`, or `{}`. The chat window, on the Node
target only, is `src/chat/`: assistant-ui's components over the SDK's `useChat` at `/chat`. It runs the page's tools,
`PAGE_TOOLS` of `said.ts` (which `tools.ts` lists too), over the host's PodApi: a navigation moves the app in place
with the chat open, and a write waits on the page's own ask, `useConfirm()` of `src/confirm.tsx` (Allow, or Cancel,
which tells the model "The person said no"). It keeps the chats in `localStorage`, each under the pod it is about, and
none of an encrypted pod's (`src/chat/chats.ts`). The screens draw "Ask about this" (`src/ask.tsx`) once `GET /chat`
names a model; any element with `data-ask` (a JSON context) starts a new chat with that context, and one with
`data-ask-text` sends its text as typed.

`npm run model` runs `model.ts`: it asks which model a chat uses, checks on the AI SDK that the model calls a tool and
writes `CASCADE_MODEL_PROVIDER`, `_URL`, `_NAME` and `_KEY` to `.env` (untracked; `--off` removes them). `models.ts` is
the door to a model for the server: `modelFrom()` reads those settings, loads `.env` itself and gives nothing when
there are none, and `modelOf()` makes the model through the AI SDK's provider packages: `@ai-sdk/anthropic`,
`@ai-sdk/groq`, `@openrouter/ai-sdk-provider`, and `@ai-sdk/openai-compatible` for Gemini (at its OpenAI-compatible
address), a model on this computer and any other address. Nothing else may hold a model's key.

The chat is a door to the one list: it offers every tool, the page running the ones with no server `execute`. A move
added to `PAGE_TOOLS` also needs an output in `CLIENT_OUTPUTS` in `server/chat.ts`. `test/chat.test.ts` puts the chat
behind the server with the AI SDK's mock model in place of a provider, so it needs no key or network: copy it to test
what the chat answers.
