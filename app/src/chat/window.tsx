// The chat window at the foot of every screen on the Node target: assistant-ui's components over the AI SDK's chat at
// the server's `/chat`. The model's navigation moves the app in place with the chat open; a write it asks for waits on
// the person's Allow. Its chats are kept as `chats.ts` says; "Ask about this" buttons start one about their thing.
import { useChat } from "@ai-sdk/react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useLocation, useNavigate } from "react-router";
import {
  firstQuestion,
  maps,
  suggestedQuestions,
  type Abouts,
  type Answers,
  type Finding as Changed,
  type ToolInput,
  type VariantsSaid,
} from "../../said.ts";
import { routed, useAddress } from "../address.tsx";
import { type ChatModel, useHost } from "../api.tsx";
import type { Asked } from "../ask.tsx";
import { busy } from "../doing.ts";
import {
  forgetOpen,
  fresh,
  isFolded,
  keepChats,
  keepFolded,
  keptChats,
  newestFirst,
  openChat,
  sent,
  type Kept,
  type Note,
} from "./chats.ts";
import { usePageTools } from "./tools.ts";

/** How many characters of earlier messages a question carries. */
const BUDGET = 24_000;

/** A finding of `find_changes`, as the page gets it: the model's compact finding with its rows and the app's sentence. */
interface Found {
  readonly key: string;
  readonly said?: string;
  readonly unit: string;
  readonly view: string;
  readonly test: {
    readonly code: string;
    readonly notation?: string;
    readonly name?: string;
  };
  readonly medication: { readonly name: string };
  readonly before: Side;
  readonly after: Side;
  readonly rows: readonly {
    readonly entry: string;
    readonly performed: string;
    readonly value: string;
    readonly unit: string;
    readonly side: string;
  }[];
}

interface Side {
  readonly count: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

/** What the window gives what it draws: the notes under messages, and how a card's Open the trend moves the app. */
interface Drawn {
  readonly notes: Readonly<Record<string, Note>>;
  readonly open: (address: string) => void;
}

const DrawnContext = createContext<Drawn>({ notes: {}, open: () => {} });

const round = (number: number) => Math.round(number * 10) / 10;

const sideSaid = (name: string, side: Side, unit: string) =>
  side.count === 0
    ? `${name}: no results`
    : `${name}: mean ${round(side.mean)} ${unit} over ${side.count} ${side.count === 1 ? "result" : "results"} (${round(side.min)} to ${round(side.max)})`;

/** A finding as a card: the app's sentence, its numbers, a link to each result's entry, and Open the trend. */
function Card({ finding }: { finding: Found }) {
  const { open } = useContext(DrawnContext);
  const test = finding.test.name ?? finding.test.notation ?? finding.test.code;
  const base = finding.view.replace(/trend\?.*$/, "");
  return (
    <div className="card">
      <p className="said">
        {finding.said ??
          `${test}: not enough results around ${finding.medication.name}`}
      </p>
      <p className="muted">
        {sideSaid("Before", finding.before, finding.unit)}
      </p>
      <p className="muted">{sideSaid("After", finding.after, finding.unit)}</p>
      <ul>
        {finding.rows.map((row) => (
          <li key={`${row.entry} ${row.side}`}>
            <a href={`${base}entries/${encodeURIComponent(row.entry)}`}>
              {`${row.performed.slice(0, 10)}: ${row.value} ${row.unit}`}
            </a>{" "}
            <span className="tag">{row.side}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="quiet"
        onClick={() => open(finding.view)}
      >
        Open the trend
      </button>
    </div>
  );
}

/** The cards of every finding `find_changes` gave in the message, after its text. */
function Cards() {
  const parts = useAuiState(({ message }) => message.parts);
  const found = parts.flatMap((part) =>
    part.type === "tool-call" &&
    part.toolName === "find_changes" &&
    !part.isError &&
    Array.isArray(part.result)
      ? (part.result as Found[])
      : [],
  );
  return found.map((finding) => <Card key={finding.key} finding={finding} />);
}

const Said = ({ text }: { text: string }) => <div>{text}</div>;
const Refused = ({ data }: { data: { text?: string } }) => (
  <div className="refused">The model declined: {data.text}</div>
);
const Silent = () => null;

/** What the window says under the message: that it stopped, or that no answer came and why. */
function Noted({ inside }: { inside: boolean }) {
  const id = useAuiState(({ message }) => message.id);
  const note = useContext(DrawnContext).notes[id];
  if (note?.kind === "stopped")
    return inside ? <div className="stopped">Stopped.</div> : null;
  if (note?.kind === "failed" && !inside)
    return <div className="failed">No answer: {note.text}</div>;
  return null;
}

function UserMessage() {
  const id = useAuiState(({ message }) => message.id);
  const stopped = useContext(DrawnContext).notes[id]?.kind === "stopped";
  return (
    <>
      <MessagePrimitive.Root className="you">
        <MessagePrimitive.Parts components={{ Text: Said }} />
      </MessagePrimitive.Root>
      {stopped && (
        <div className="model">
          <div className="stopped">Stopped.</div>
        </div>
      )}
      <Noted inside={false} />
    </>
  );
}

function AssistantMessage() {
  return (
    <>
      <MessagePrimitive.Root className="model">
        <MessagePrimitive.Parts
          components={{
            Text: Said,
            tools: { Override: Silent },
            data: { by_name: { refused: Refused }, Fallback: Silent },
          }}
        />
        <Cards />
        <Noted inside />
      </MessagePrimitive.Root>
      <Noted inside={false} />
    </>
  );
}

/** Why no answer came, in the words the strip used: the server's own reason, or what stopped it reaching the app. */
function failure(error: Error): string {
  const { responseBody, statusCode } = error as Error & {
    responseBody?: string;
    statusCode?: number;
  };
  if (statusCode !== undefined) {
    try {
      const { error: said } = JSON.parse(responseBody ?? "") as {
        error?: unknown;
      };
      if (typeof said === "string") return said;
    } catch {
      // the body was not the app's JSON
    }
    return `the app answered ${statusCode}`;
  }
  if (error instanceof TypeError)
    return `the app could not be reached: ${error.message}`;
  return error.message;
}

/** The id of the message `message` became in `messages`, else the last of them: what a note goes under. */
const noteAt = (message: UIMessage, messages: readonly UIMessage[]) =>
  messages.some((each) => each.id === message.id)
    ? message.id
    : messages.at(-1)?.id;

/**
 * One chat, open: its messages, its suggestions, its form. `first` is sent as the person's first question once it is
 * drawn; `saved` is told the messages whenever a turn starts or ends, with the note to put under one.
 */
function Thread({
  kept,
  pod,
  first,
  suggestions,
  saved,
  running,
  asking,
  opened,
  open,
  sender,
}: {
  kept: Kept;
  pod: string;
  first: string | undefined;
  suggestions: readonly string[];
  saved: (
    id: string,
    messages: readonly UIMessage[],
    note?: [string, Note],
  ) => void;
  running: (on: boolean) => void;
  asking: () => void;
  opened: () => void;
  open: (address: string) => void;
  sender: RefObject<((text: string) => void) | undefined>;
}) {
  const address = useAddress();
  const run = usePageTools(opened);
  const { id, context, notes } = kept;
  const latest = useRef({ pod, running, asking, saved: saved.bind(null, id) });
  useLayoutEffect(() => {
    latest.current = { pod, running, asking, saved: saved.bind(null, id) };
  });
  const failed = useRef(false);
  /** That this chat is no longer open: an answer to a tool it called would continue a chat nothing draws. */
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
    };
  }, []);
  const continued = useRef(new Set<string>());
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: `${address.home}chat`,
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            pod: latest.current.pod,
            page: location.pathname + location.search,
            messages: sent(messages, BUDGET),
            ...(context === undefined ? {} : { context }),
          },
        }),
      }),
    [address, context],
  );
  const chat = useChat<UIMessage>({
    id,
    messages: kept.messages as UIMessage[],
    transport,
    onToolCall: ({ toolCall }) => {
      const { toolName, toolCallId } = toolCall;
      void run(toolName, toolCall.input as ToolInput).then((answer) => {
        if (answer === undefined || gone.current) return;
        void helpers.current.addToolOutput(
          "output" in answer
            ? { tool: toolName, toolCallId, output: answer.output }
            : {
                tool: toolName,
                toolCallId,
                state: "output-error",
                errorText: answer.errorText,
              },
        );
      });
    },
    sendAutomaticallyWhen: ({ messages }) => {
      if (
        failed.current ||
        !lastAssistantMessageIsCompleteWithToolCalls({ messages })
      )
        return false;
      const last = messages.at(-1);
      const called = (last?.parts ?? []).flatMap((part) =>
        "toolCallId" in part ? [`${last!.id} ${part.toolCallId}`] : [],
      );
      if (called.every((id) => continued.current.has(id))) return false;
      for (const id of called) continued.current.add(id);
      return true;
    },
    onFinish: ({ message, messages, isAbort, isError }) => {
      failed.current = isError || isAbort;
      if (!isAbort) return;
      const at = noteAt(message, messages);
      if (at !== undefined)
        latest.current.saved(messages, [at, { kind: "stopped" }]);
    },
  });
  const helpers = useRef(chat);
  helpers.current = chat;
  const runtime = useAISDKRuntime(chat);
  const { status, error, messages, sendMessage } = chat;
  const busyNow = status === "submitted" || status === "streaming";
  useEffect(() => {
    latest.current.running(busyNow);
  }, [busyNow]);
  useEffect(() => {
    if (status === "submitted") latest.current.asking();
    if (status === "streaming") return;
    const last = helpers.current.messages.at(-1);
    latest.current.saved(
      helpers.current.messages,
      status === "error" && error !== undefined && last !== undefined
        ? [last.id, { kind: "failed", text: failure(error) }]
        : undefined,
    );
  }, [status, error]);
  useEffect(() => () => latest.current.saved(helpers.current.messages), []);
  useEffect(() => {
    if (first === undefined) return;
    const later = setTimeout(() => {
      if (helpers.current.messages.length === 0)
        void sendMessage({ text: first });
    });
    return () => clearTimeout(later);
  }, [first, sendMessage]);

  const log = useRef<HTMLDivElement>(null);
  const taken = useRef(false);
  useEffect(() => {
    if (status === "submitted") taken.current = false;
  }, [status]);
  useLayoutEffect(() => {
    const shown = log.current;
    if (shown === null) return;
    const asked = [...shown.querySelectorAll(".you")].at(-1);
    if (asked === undefined) {
      shown.scrollTop = shown.scrollHeight;
      return;
    }
    if (taken.current) return;
    const answer = asked.nextElementSibling ?? asked;
    const start =
      answer.getBoundingClientRect().top - asked.getBoundingClientRect().top >
      shown.clientHeight * 0.75
        ? answer
        : asked;
    shown.scrollTop +=
      start.getBoundingClientRect().top - shown.getBoundingClientRect().top;
  }, [messages, notes]);
  const take = () => {
    taken.current = true;
  };
  useLayoutEffect(() => {
    sender.current = (text) => {
      if (text.trim() !== "") void sendMessage({ text: text.trim() });
    };
  }, [sender, sendMessage]);
  const drawn = useMemo(() => ({ notes, open }), [notes, open]);
  const empty = messages.length === 0;
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <DrawnContext.Provider value={drawn}>
        <div
          className="chat-about muted"
          hidden={context === undefined}
          title={context === undefined ? undefined : `About: ${kept.label}`}
        >
          {context === undefined ? "" : `About: ${kept.label}`}
        </div>
        <ThreadPrimitive.Viewport
          ref={log}
          className="chat-log"
          role="log"
          aria-live="polite"
          hidden={empty}
          autoScroll={false}
          scrollToBottomOnRunStart={false}
          scrollToBottomOnInitialize={false}
          scrollToBottomOnThreadSwitch={false}
          onWheel={take}
          onTouchMove={take}
          onPointerDown={take}
          onKeyDown={take}
        >
          <ThreadPrimitive.Messages
            components={{ UserMessage, AssistantMessage }}
          />
        </ThreadPrimitive.Viewport>
        <div
          className="chat-chips"
          hidden={!empty || context !== undefined || suggestions.length === 0}
        >
          {suggestions.map((text) => (
            <button
              type="button"
              className="quiet"
              key={text}
              data-ask-text={text}
            >
              {text}
            </button>
          ))}
        </div>
        <ComposerPrimitive.Root className="chat-form">
          <ComposerPrimitive.Input
            render={<input />}
            name="text"
            autoComplete="off"
            aria-label="Ask a question"
            placeholder={
              pod === "" ? "Ask about your pods" : "Ask about this pod"
            }
          />
          <ComposerPrimitive.Send className="chat-send" hidden={busyNow}>
            Send
          </ComposerPrimitive.Send>
          <ComposerPrimitive.Cancel
            className="quiet chat-stop"
            hidden={!busyNow}
          >
            Stop
          </ComposerPrimitive.Cancel>
        </ComposerPrimitive.Root>
      </DrawnContext.Provider>
    </AssistantRuntimeProvider>
  );
}

/**
 * What the window knows of the pod shown: whether its chat is kept only in the page (an encrypted pod's, and any
 * pod's until the app has said: undefined), and the questions it suggests.
 */
function usePodChat(pod: string) {
  const { api } = useHost();
  const [sealed, setSealed] = useState<{ pod: string; sealed: boolean }>();
  const [offered, setOffered] = useState<{ pod: string; said: string[] }>();
  useEffect(() => {
    if (pod === "") {
      setSealed({ pod, sealed: false });
      return;
    }
    let live = true;
    void (async () => {
      const { encrypted, locked } = await api.pod({ pod });
      if (!live) return;
      setSealed({ pod, sealed: encrypted });
      if (locked !== undefined) return;
      const [{ answers, changes }, said] = await Promise.all([
        api.answers({ pod }),
        api.said({ pod }),
      ]);
      const { about, said: variants } = maps(said) as {
        about?: Abouts;
        said?: VariantsSaid;
      };
      if (live)
        setOffered({
          pod,
          said: suggestedQuestions(answers as Answers, {
            changes: changes as readonly Changed[],
            ...(about === undefined ? {} : { about }),
            ...(variants === undefined ? {} : { said: variants }),
          }),
        });
    })().catch(() => {
      if (live)
        setSealed((now) => (now?.pod === pod ? now : { pod, sealed: true }));
    });
    return () => {
      live = false;
    };
  }, [api, pod]);
  return {
    sealed: sealed?.pod === pod ? sealed.sealed : undefined,
    suggestions: offered?.pod === pod ? offered.said : [],
  };
}

/** The window of a host whose chat names a model: the bar, the open chat, Recent chats; the strip's behaviour, kept. */
function Window({ model, pod }: { model: ChatModel; pod: string }) {
  const navigate = useNavigate();
  const { sealed, suggestions } = usePodChat(pod);
  const known = useRef(sealed);
  known.current = sealed;
  /** The last pod the app said anything of, and what: a chat leaving a pod it never said anything of is sealed. */
  const learned = useRef<{ pod: string; sealed: boolean }>(undefined);
  if (sealed !== undefined) learned.current = { pod, sealed };
  const { pathname, search } = useLocation();
  /** The chats kept only in the page: an encrypted pod's, and one shown before the app said whether its pod is. */
  const inPage = useRef<Kept[]>([]);
  const stored = () => [
    ...inPage.current,
    ...keptChats().filter(
      (each) => !inPage.current.some(({ id }) => id === each.id),
    ),
  ];
  const [chat, setChat] = useState<Kept>(
    () =>
      keptChats().find((each) => each.id === openChat() && each.pod === pod) ??
      fresh(pod),
  );
  const shownChat = useRef(chat);
  const [chats, setChats] = useState<readonly Kept[]>(keptChats);
  const [first, setFirst] = useState<{ id: string; text: string }>();
  const [folded, setFolded] = useState(isFolded);
  const [recent, setRecent] = useState(false);
  const [running, setRunning] = useState(false);
  const following = useRef(false);
  const at = pathname + search;
  const now = useRef({ running, first, at });
  useLayoutEffect(() => {
    now.current = { running, first, at };
  });

  const fold = useCallback((to: boolean) => {
    setFolded(to);
    keepFolded(to);
  }, []);
  const unfold = useCallback(() => fold(false), [fold]);

  /** Opens `next`, as it is. */
  const show = useCallback((next: Kept) => {
    shownChat.current = next;
    setChat(next);
  }, []);

  /**
   * Keeps `next`, the newest of the chats, and opens it unless another chat is open by now. A chat that has been about
   * an encrypted pod stays in the page wherever it goes.
   */
  const keep = useCallback(
    (next: Kept, opening = true) => {
      const kept: Kept = {
        ...next,
        updated: Date.now(),
        ...(next.sealed === true || known.current === true
          ? { sealed: true }
          : {}),
      };
      const list = newestFirst([
        kept,
        ...stored().filter((each) => each.id !== kept.id),
      ]);
      if (opening) show(kept);
      const unsaid = (each: Kept) =>
        each.sealed === true ||
        (inPage.current.some(({ id }) => id === each.id)
          ? !(each.id === kept.id && known.current === false)
          : each.id === kept.id && known.current === undefined);
      inPage.current = list.filter(unsaid);
      const open = shownChat.current;
      keepChats(
        list.filter((each) => !unsaid(each)),
        unsaid(open) ? undefined : open.id,
      );
      setChats(list);
    },
    [show],
  );

  useEffect(() => {
    if (sealed === undefined) return;
    if (shownChat.current.messages.length === 0) setChats(stored());
    else keep(shownChat.current);
  }, [sealed, keep]);

  useEffect(() => {
    const shown = shownChat.current;
    if (shown.pod === pod) return;
    if (following.current) {
      following.current = false;
      const was =
        learned.current?.pod === shown.pod ? learned.current.sealed : undefined;
      keep({ ...shown, pod, ...(was === false ? {} : { sealed: true }) });
      return;
    }
    show(
      stored().find((each) => each.id === openChat() && each.pod === pod) ??
        fresh(pod),
    );
    setChats(stored());
  }, [pod]);

  // After the pod effect, which reads it on the move that changes the pod: a move that stays in the pod is over.
  useEffect(() => {
    following.current = false;
  }, [pathname, search]);

  const saved = useCallback(
    (id: string, messages: readonly UIMessage[], note?: [string, Note]) => {
      const open = shownChat.current.id === id;
      const shown = open
        ? shownChat.current
        : stored().find((each) => each.id === id);
      if (shown === undefined) return;
      const asked = messages.find(({ role }) => role === "user");
      const text = asked?.parts.find((part) => part.type === "text");
      keep(
        {
          ...shown,
          title:
            shown.title ||
            (text?.type === "text" ? text.text.slice(0, 60) : ""),
          messages,
          notes:
            note === undefined
              ? shown.notes
              : { ...shown.notes, [note[0]]: note[1] },
        },
        open,
      );
    },
    [keep],
  );

  const opened = useCallback(() => {
    following.current = true;
  }, []);
  const sender = useRef<(text: string) => void>(undefined);

  const open = useCallback(
    (address: string) => {
      const to = routed(new URL(address, location.href));
      if (now.current.running || to === now.current.at) return;
      following.current = true;
      busy("Opening…");
      void navigate(to);
    },
    [navigate],
  );

  const begin = useCallback(
    (context?: Asked, label?: string, question?: string) => {
      const started = fresh(pod, context, label);
      forgetOpen();
      show(started);
      setFirst(
        question === undefined ? undefined : { id: started.id, text: question },
      );
      fold(false);
    },
    [pod, fold, show],
  );

  useLayoutEffect(() => {
    const click = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest?.(
        "[data-ask], [data-ask-text]",
      );
      if (!(target instanceof HTMLElement)) return;
      const shown = shownChat.current;
      const { running: on, first: waiting } = now.current;
      if (target.dataset.ask !== undefined) {
        let about: Asked;
        try {
          about = JSON.parse(target.dataset.ask) as Asked;
        } catch {
          return;
        }
        const starting =
          waiting?.id === shown.id && shown.messages.length === 0;
        if (
          (on || starting) &&
          shown.messages.length <= 2 &&
          JSON.stringify(shown.context) === JSON.stringify(about)
        )
          return;
        begin(about, target.dataset.askLabel ?? "", firstQuestion(about));
        return;
      }
      if (!on) sender.current?.(target.dataset.askText ?? "");
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [begin]);

  const here = chats.filter((each) => each.pod === pod);
  return (
    <section
      className="chat"
      aria-label="Chat"
      data-folded={folded ? "true" : "false"}
    >
      <div className="chat-bar">
        <strong>Chat</strong>
        <span className="muted">
          {model.name}
          {model.local ? ", on this computer" : `, from ${model.provider}`}
        </span>
        <details
          className="chat-recent"
          open={recent}
          onToggle={(event) => setRecent(event.currentTarget.open)}
        >
          <summary>Recent chats</summary>
          <ul>
            {here.length === 0 ? (
              <li className="empty">No chats yet</li>
            ) : (
              here.map((each) => (
                <li key={each.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (running) return;
                      setRecent(false);
                      setFirst(undefined);
                      fold(false);
                      keep(each);
                    }}
                  >
                    {each.title}
                  </button>
                </li>
              ))
            )}
          </ul>
        </details>
        <button
          type="button"
          className="quiet chat-new"
          onClick={() => {
            if (!running) begin();
          }}
        >
          New chat
        </button>
        <button
          type="button"
          className="quiet chat-fold"
          aria-expanded={!folded}
          onClick={() => fold(!folded)}
        >
          {folded ? "Show chat" : "Hide chat"}
        </button>
      </div>
      <Thread
        key={chat.id}
        kept={chat}
        pod={pod}
        first={first?.id === chat.id ? first.text : undefined}
        suggestions={suggestions}
        saved={saved}
        running={setRunning}
        asking={unfold}
        opened={opened}
        open={open}
        sender={sender}
      />
    </section>
  );
}

/** The chat window: the model's chat, or with no model set, how to set one. */
export function ChatWindow({
  model,
  pod,
}: {
  model: ChatModel | undefined;
  pod: string;
}) {
  if (model === undefined)
    return (
      <section className="chat" aria-label="Chat">
        <p className="chat-off">
          To chat with a model about these pods, run <code>npm run model</code>.
        </p>
      </section>
    );
  return <Window model={model} pod={pod} />;
}
