// Making a pod and opening one: the new-pod box, the six words of an encrypted pod to keep and check, and the screen
// that asks an encrypted pod for its words. The words live in these screens' state alone: never in an address, never
// in storage.
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useParams } from "react-router";
import {
  byFamily,
  ENCRYPT_BOX,
  familyFirst,
  hospitalName,
  listed,
  personName,
  slug,
  UNOPENED,
  type Person,
} from "../said.ts";
import { Notice, useActions } from "./actions.tsx";
import { ROUTED, useGeneration } from "./address.tsx";
import { isRefusal, useHost } from "./api.tsx";
import { ready } from "./doing.ts";
import { lead, muted, note, row, stack, stackLabel } from "./look.ts";
import { Box, PostButton } from "./parts.tsx";

/** Whether `error` is what the rules refused, rather than a pod that would not open. */
const refused = (error: unknown): error is Error =>
  isRefusal(error) && error.name === "Refusal";

/** A one-click choice of the new-pod box: a button that posts `fields`, and says what it is. */
function Choice({
  label,
  note,
  fields,
  doing,
  onChoose,
}: {
  label: string;
  note: string;
  fields: Record<string, string>;
  doing: string;
  onChoose: () => void;
}) {
  return (
    <li className="my-[0.35rem]">
      <PostButton
        action="make"
        block
        className="block w-full border-line bg-soft text-left text-text hover:border-accent hover:bg-tint"
        fields={fields}
        doing={doing}
        onPost={onChoose}
      >
        {label}
        <span className="muted block text-[0.8rem] text-muted">{note}</span>
      </PostButton>
    </li>
  );
}

/**
 * The box that makes a new pod, shown when the page's address ends `#new-pod`: what a pod is, a button for each demo
 * person among `people` with no pod among `pods` yet, one for each of the `samples` not among them, and a field for
 * anyone's name. Whichever way the pod is made, it is made encrypted when the box is ticked.
 */
export function NewPod({
  people,
  pods,
  samples,
}: {
  people: readonly Person[];
  pods: readonly string[];
  samples: readonly string[];
}) {
  const { api } = useHost();
  const { act, refreshPods } = useActions();
  const [encrypt, setEncrypt] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const make = (person: string, doing: string) =>
    act(async (go) => {
      const made = await api.makePod({ person, encrypt });
      setEncrypt(false);
      if (field.current !== null) field.current.value = "";
      if (made.waiting === true) return go(ROUTED.words(made.pod));
      await refreshPods();
      go(ROUTED.pod(made.pod));
    }, doing);
  const demo = byFamily(people).filter(
    (person) => !pods.includes(slug(person.name)),
  );
  const loadable = samples.filter((name) => !pods.includes(name));
  return (
    <Box id="new-pod" heading="Make a new pod">
      <p>
        A pod keeps one person's health records, wherever they come from: files
        they download, and hospitals they sign in to. It notices when two
        sources describe the same thing, and when they disagree.
      </p>
      <p className="encrypt my-3">
        <label>
          <input
            type="checkbox"
            id={ENCRYPT_BOX}
            checked={encrypt}
            onChange={(event) => setEncrypt(event.currentTarget.checked)}
          />{" "}
          Encrypt this pod with six words
        </label>
        <span className="muted ml-[1.6rem] block text-[0.9rem] text-muted">
          You get six words to keep. Only they open the pod again.
        </span>
      </p>
      {demo.length > 0 && (
        <>
          <p>
            <strong>
              Try someone with records waiting at the demo hospitals. They are
              made up, and signing in needs no password.
            </strong>
          </p>
          <ul className="people mt-2 mr-0 mb-5 ml-0 list-none p-0">
            {demo.map((person) => (
              <Choice
                key={person.name}
                label={familyFirst(person)}
                note={`Records waiting at ${listed(person.at.map(({ name }) => hospitalName(name)))}`}
                fields={{ person: person.name }}
                doing={`Making ${person.name}'s pod…`}
                onChoose={() =>
                  make(person.name, `Making ${person.name}'s pod…`)
                }
              />
            ))}
          </ul>
        </>
      )}
      {loadable.length > 0 && (
        <>
          <p>
            <strong>
              Or open a sample pod, already filled with records from several
              places.
            </strong>
          </p>
          <ul className="people mt-2 mr-0 mb-5 ml-0 list-none p-0">
            {loadable.map((name) => (
              <Choice
                key={name}
                label={`Load ${personName(name)}`}
                note="A copy of a published example pod"
                fields={{ pod: name }}
                doing={`Loading ${personName(name)}'s pod…`}
                onChoose={() =>
                  make(name, `Loading ${personName(name)}'s pod…`)
                }
              />
            ))}
          </ul>
        </>
      )}
      <p>
        <strong>Or make one for anyone.</strong> You can bring in records
        afterwards.
      </p>
      <form
        method="post"
        action="make"
        className={row}
        data-doing="Making the pod…"
        onSubmit={(event) => {
          event.preventDefault();
          make(field.current?.value ?? "", "Making the pod…");
        }}
      >
        <input
          className="min-w-40 flex-1"
          ref={field}
          name="person"
          placeholder="A person's name"
          aria-label="A person's name"
          required
        />
        <button>Make the pod</button>
      </form>
    </Box>
  );
}

/** Offers the words to the browser's password manager, where it has an API for it; never relied on. */
function offerToSave(name: string, words: string): void {
  try {
    const { PasswordCredential } = globalThis as {
      PasswordCredential?: new (init: {
        id: string;
        name: string;
        password: string;
      }) => Credential;
    };
    if (PasswordCredential === undefined) return;
    navigator.credentials
      .store(new PasswordCredential({ id: name, name, password: words }))
      .catch(() => undefined);
  } catch {
    // The offer is a courtesy.
  }
}

/** What the words screen holds of the pod being made: its person's name and its words, or why there is none. */
type Waiting =
  | { readonly person: string; readonly words: string }
  | { readonly refused: string }
  | { readonly wrong: string };

/** The screen at `/encrypted-pods/<pod>`: the words PodApi holds for the pod being made, or why it holds none. */
export function WordsScreen() {
  const { api } = useHost();
  const { pod = "" } = useParams();
  const generation = useGeneration();
  const [waiting, setWaiting] = useState<Waiting>();
  useEffect(() => {
    let live = true;
    api.waitingWords({ pod }).then(
      ({ person, words }) => live && setWaiting({ person, words }),
      (error: unknown) => {
        if (!live) return;
        setWaiting(
          refused(error)
            ? { refused: error.message }
            : {
                wrong: error instanceof Error ? error.message : String(error),
              },
        );
      },
    );
    return () => {
      live = false;
    };
  }, [api, pod, generation]);
  useEffect(() => {
    if (waiting === undefined) return;
    document.title = `${"words" in waiting ? "Your six words" : "Not done"} · Cascade`;
    if ("words" in waiting) ready();
  }, [waiting]);
  if (waiting === undefined) return null;
  if ("refused" in waiting)
    return <Notice heading="Not done">{waiting.refused}</Notice>;
  if ("wrong" in waiting)
    return (
      <Notice heading="Something went wrong" wrong>
        {waiting.wrong}
      </Notice>
    );
  return <SixWords pod={pod} person={waiting.person} words={waiting.words} />;
}

/**
 * The first step of making an encrypted pod: the six `words` large and numbered, what to do with them, and a form that
 * asks for words 2 and 5. The form carries, in two visible fields a password manager reads as a sign-up (`username`,
 * `password`), the pod's name and the words; PodApi refuses a form where either has changed. Nothing is made until the
 * form is answered.
 */
export function SixWords({
  pod,
  person,
  words,
}: {
  pod: string;
  person: string;
  words: string;
}) {
  const { api } = useHost();
  const { act, refreshPods } = useActions();
  const [problem, setProblem] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(words);
      setCopied("Copied");
    } catch {
      setCopied("Copy isn't available here; write the words down.");
    }
  };
  return (
    <>
      <h1>Your six words</h1>
      <p className={lead}>
        For {personName(pod, new Map([[pod, person]]))}'s pod.
      </p>
      <ol className="words my-4 grid [counter-reset:word] list-none grid-cols-[repeat(3,1fr)] gap-[0.6rem] p-0">
        {words.split(" ").map((word, at) => (
          <li
            className="rounded-lg border border-line bg-soft px-4 py-[0.8rem] text-[1.35rem] font-semibold [counter-increment:word] before:mr-[0.6rem] before:text-[0.8rem] before:font-normal before:text-muted before:content-[counter(word)]"
            key={at}
          >
            {word}
          </li>
        ))}
      </ol>
      <p>
        Write these down, or save them in your password manager. They are the
        only way into this pod. Nobody can recover them: if you lose them, the
        pod's records are gone for good.
      </p>
      <p className={muted}>
        Encryption hides what the records say. It does not hide that this pod
        exists, its name, how many files it has or their sizes.
      </p>
      {problem !== undefined && (
        <p className={note} role="alert">
          {problem}
        </p>
      )}
      <form
        key={attempt}
        method="post"
        action="confirm-words"
        className={stack}
        data-doing="Making the pod…"
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const typed = (name: string) => String(fields.get(name) ?? "");
          act(async (go) => {
            try {
              await api.confirmWords({
                pod,
                word2: typed("word2"),
                word5: typed("word5"),
                password: typed("password"),
                username: typed("username"),
              });
            } catch (error) {
              const waits = await api.waitingWords({ pod }).then(
                () => true,
                () => false,
              );
              if (!refused(error) || !waits) throw error;
              flushSync(() => {
                setProblem(error.message);
                setAttempt((now) => now + 1);
              });
              return;
            }
            offerToSave(pod, words);
            await refreshPods();
            go(ROUTED.pod(pod));
          }, "Making the pod…");
        }}
      >
        <label className={stackLabel}>
          Pod{" "}
          <input
            type="text"
            name="username"
            autoComplete="username"
            defaultValue={pod}
          />
        </label>
        <label className={stackLabel}>
          Password{" "}
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            defaultValue={words}
          />
        </label>
        <p className={muted}>
          Your password manager can save these as the pod's password.{" "}
          <button type="button" data-copy-words onClick={() => void copy()}>
            Copy words
          </button>{" "}
          <span data-copied role="status">
            {copied}
          </span>
        </p>
        <p>
          <strong>Check that you have them.</strong> Type the second and the
          fifth word.
        </p>
        <label className={stackLabel}>
          Word 2{" "}
          <input
            name="word2"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        <label className={stackLabel}>
          Word 5{" "}
          <input
            name="word5"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        <p>
          <button>Make the encrypted pod</button>
        </p>
      </form>
    </>
  );
}

/**
 * The screen at any address of the encrypted pod `pod` while it is not open. `outcome` is how it last failed to open:
 * "secret needed" before any words were given, else an `Unopened` outcome. Where words could still open it, the
 * screen has a form whose `username` and `current-password` fields a password manager fills; otherwise only the
 * outcome's sentence. Opening it draws the address asked for again.
 */
export function Unlock({
  pod,
  titles,
  outcome,
}: {
  pod: string;
  titles: ReadonlyMap<string, string>;
  outcome: string;
}) {
  const { api } = useHost();
  const { act } = useActions();
  const { pathname, search } = useLocation();
  const [failure, setFailure] = useState(outcome);
  const [attempt, setAttempt] = useState(0);
  useEffect(ready, [attempt]);
  const said = UNOPENED[failure];
  const wordsHelp =
    failure === "secret needed" || failure === "incorrect secret";
  return (
    <>
      <h1>Open {personName(pod, titles)}'s pod</h1>
      {wordsHelp && (
        <p>This pod is encrypted. Type its six words to open it.</p>
      )}
      {said !== undefined && (
        <p className={note} role="alert">
          {said}
        </p>
      )}
      {wordsHelp && (
        <form
          key={attempt}
          method="post"
          action="unlock"
          className={stack}
          data-doing="Opening the pod…"
          autoComplete="on"
          onSubmit={(event) => {
            event.preventDefault();
            const secret = String(
              new FormData(event.currentTarget).get("password") ?? "",
            );
            act(async (go) => {
              try {
                await api.unlock({ pod, secret });
              } catch (error) {
                if (!(error instanceof Error) || error.name !== "Unopened")
                  throw error;
                flushSync(() => {
                  setFailure(
                    (error as Error & { outcome?: string }).outcome ??
                      "incorrect secret",
                  );
                  setAttempt((now) => now + 1);
                });
                return;
              }
              go(pathname + search);
            }, "Opening the pod…");
          }}
        >
          <label className={stackLabel}>
            Pod{" "}
            <input
              type="text"
              name="username"
              autoComplete="username"
              defaultValue={pod}
            />
          </label>
          <label className={stackLabel}>
            Your six words{" "}
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </label>
          <p>
            <button>Open this pod</button>
          </p>
        </form>
      )}
    </>
  );
}
