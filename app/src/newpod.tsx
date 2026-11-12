// Making a pod and opening one: the new-pod box, the six words of an encrypted pod to keep and check, and the screen
// that asks an encrypted pod for its words. The words live in these screens and the forms that post them alone: never
// in an address, never in storage.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  useActionData,
  useLocation,
  type LoaderFunctionArgs,
} from "react-router";
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
import type { Stayed } from "./actions.tsx";
import type { PodApi } from "./api.tsx";
import { lead, muted, note, row, stack, stackLabel } from "./look.ts";
import { Box, PostButton, StepFields, StepForm } from "./parts.tsx";
import { screen, useRead } from "./screen.tsx";

/**
 * A number that changes with each outcome a step's action gives, for a form drawn again empty after each, even when
 * two in a row say the same.
 */
function useAttempt(): {
  readonly did: Stayed | undefined;
  readonly n: number;
} {
  const did = useActionData() as Stayed | undefined;
  const seen = useRef<{ did: Stayed | undefined; n: number }>({ did, n: 0 });
  if (seen.current.did !== did) seen.current = { did, n: seen.current.n + 1 };
  return seen.current;
}

/** A one-click choice of the new-pod box: a button that makes the pod `fields` say, and says what it is. */
function Choice({
  label,
  note,
  fields,
  doing,
}: {
  label: string;
  note: string;
  fields: Record<string, string>;
  doing: string;
}) {
  return (
    <li className="my-[0.35rem]">
      <PostButton
        intent="make"
        block
        className="block w-full border-line bg-soft text-left text-text hover:border-accent hover:bg-tint"
        fields={fields}
        doing={doing}
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
  const [encrypt, setEncrypt] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const { pathname, search } = useLocation();
  useEffect(() => {
    setEncrypt(false);
    if (field.current !== null) field.current.value = "";
  }, [pathname, search]);
  const encrypted = { encrypt: encrypt ? "on" : "" };
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
                fields={{ person: person.name, ...encrypted }}
                doing={`Making ${person.name}'s pod…`}
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
                fields={{ pod: name, ...encrypted }}
                doing={`Loading ${personName(name)}'s pod…`}
              />
            ))}
          </ul>
        </>
      )}
      <p>
        <strong>Or make one for anyone.</strong> You can bring in records
        afterwards.
      </p>
      <StepForm className={row}>
        <StepFields intent="make" doing="Making the pod…" fields={encrypted} />
        <input
          className="min-w-40 flex-1"
          ref={field}
          name="person"
          placeholder="A person's name"
          aria-label="A person's name"
          required
        />
        <button>Make the pod</button>
      </StepForm>
    </Box>
  );
}

/** What the words screen holds of the pod being made: its person's name and its words, or why there is none. */
type Waiting =
  | { readonly pod: string; readonly person: string; readonly words: string }
  | { readonly refused: string };

/**
 * Reads the pod being made at `/encrypted-pods/<pod>`, or why there is none. PodApi gives its words once, so the page
 * keeps them for as long as it lives, through a step that was refused and the read after it; a page loaded again is
 * given none, and the pod is made again.
 */
export const wordsLoader = (api: PodApi) => {
  const given = new Map<string, Promise<string>>();
  return screen<Waiting>(async ({ params }: LoaderFunctionArgs) => {
    const pod = params.pod ?? "";
    try {
      const { person } = await api.waiting({ pod });
      let asked = given.get(pod);
      if (asked === undefined) {
        asked = api.waitingWords({ pod }).then(({ words }) => words);
        given.set(pod, asked);
      }
      const words = await asked.catch((error: unknown) => {
        given.delete(pod);
        throw error;
      });
      return {
        value: { pod, person, words } satisfies Waiting,
        title: "Your six words",
      };
    } catch (error) {
      given.delete(pod);
      if (!(error instanceof Error) || error.name !== "Refusal") throw error;
      return {
        value: { refused: error.message } satisfies Waiting,
        title: "Not done",
      };
    }
  });
};

/** How long the words stay on the clipboard before the page tries to clear them. */
const CLIPBOARD_MS = 60_000;

/**
 * What was said of the clipboard, kept outside the words screen, which a confirmed pod takes away: `urgent` is a thing
 * the person must do, which the page then says wherever it is.
 */
let clipboard: { readonly text: string; readonly urgent: boolean } = {
  text: "",
  urgent: false,
};
let wordsShown = 0;
let clearing: ReturnType<typeof setTimeout> | undefined;
let retrying: (() => void) | undefined;
const watchers = new Set<() => void>();

function say(text: string, urgent = false) {
  clipboard = { text, urgent };
  for (const watcher of watchers) watcher();
}

const shownBy = (by: number) => {
  wordsShown += by;
  for (const watcher of watchers) watcher();
};

const watch = (watcher: () => void) => {
  watchers.add(watcher);
  return () => void watchers.delete(watcher);
};

/** What the clipboard is said to hold, as a screen reads it. */
const useClipboard = () =>
  useSyncExternalStore(
    watch,
    () => clipboard,
    () => clipboard,
  );

/** Whether `words` was found on the clipboard and cleared, found changed, or the browser refused to read or write it. */
async function clearIfHeld(words: string) {
  try {
    if ((await navigator.clipboard.readText()) !== words) return "changed";
    await navigator.clipboard.writeText("");
    return "cleared";
  } catch {
    return "refused";
  }
}

const CLEARED = {
  changed: "The clipboard holds something else now: left alone.",
  cleared: "The clipboard is cleared.",
} as const;
const NOT_CLEARED =
  "The browser did not let this page clear the clipboard: clear it yourself.";

/**
 * Copies `words`, and after `CLIPBOARD_MS` empties the clipboard if it still holds them. Nothing is promised that the
 * browser does not allow: reading the clipboard is refused while the page is not the window in front, so then the page
 * tries once more when the window is next in front, and only if that is refused too asks the person to clear it.
 */
async function copyWords(words: string) {
  try {
    await navigator.clipboard.writeText(words);
  } catch {
    say("Copy isn't available here; write the words down.");
    return;
  }
  say("Copied. This page tries to clear the clipboard in a minute.");
  clearTimeout(clearing);
  if (retrying !== undefined) window.removeEventListener("focus", retrying);
  retrying = undefined;
  const attempt = async () => {
    clearing = undefined;
    retrying = undefined;
    const done = await clearIfHeld(words);
    if (done !== "refused") return say(CLEARED[done]);
    if (document.hasFocus()) return say(NOT_CLEARED, true);
    retrying = () => void attempt();
    window.addEventListener("focus", retrying, { once: true });
  };
  clearing = setTimeout(() => void attempt(), CLIPBOARD_MS);
}

/** What the person must do about the clipboard, on any screen but the words screen, which says everything itself. */
export function ClipboardNote() {
  const { text, urgent } = useClipboard();
  const here = useSyncExternalStore(
    watch,
    () => wordsShown,
    () => wordsShown,
  );
  if (!urgent || here > 0) return null;
  return (
    <p className={note} role="alert" data-copied>
      {text}{" "}
      <button type="button" onClick={() => say("")}>
        Dismiss
      </button>
    </p>
  );
}

export function WordsScreen() {
  const waiting = useRead<Waiting>();
  if ("refused" in waiting)
    return (
      <>
        <h1>Not done</h1>
        <p>{waiting.refused}</p>
      </>
    );
  return (
    <SixWords pod={waiting.pod} person={waiting.person} words={waiting.words} />
  );
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
  const { did, n } = useAttempt();
  const { text: copied } = useClipboard();
  useEffect(() => {
    if (clearing === undefined && retrying === undefined) say("");
    shownBy(1);
    return () => shownBy(-1);
  }, []);
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
        Encryption hides what the records say and the names of the files they
        are kept in. It does not hide that this pod exists, its name, how many
        files it has, how big they are or when they were written. Nor can it
        tell when the whole pod is swapped for an older copy of itself.
      </p>
      {did?.problem !== undefined && (
        <p className={note} role="alert">
          {did.problem}
        </p>
      )}
      <StepForm key={n} className={stack} autoComplete="on">
        <StepFields intent="confirm-words" doing="Making the pod…" />
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
          <button
            type="button"
            data-copy-words
            onClick={() => void copyWords(words)}
          >
            Copy words
          </button>{" "}
          <span data-copied role="status">
            {copied}
          </span>
        </p>
        <p className={muted}>
          Copying leaves the words on the clipboard, and a clipboard history or
          sync, such as Win+V on Windows or a cloud clipboard, may keep them
          even after it is cleared. This page tries to clear the clipboard a
          minute later, and again when you come back to this window if the
          browser would not let it; if it cannot, clear it yourself.
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
      </StepForm>
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
  const { did, n } = useAttempt();
  const failure = did?.unopened ?? outcome;
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
        <StepForm key={n} className={stack} autoComplete="on">
          <StepFields intent="unlock" doing="Opening the pod…" />
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
        </StepForm>
      )}
    </>
  );
}
