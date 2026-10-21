import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The exports of `source`, a module that imports the app's screens by their path under `app/src/`, built as the app is
 * (JSX, TypeScript, the base `/`) for Node. The packages stay outside the bundle, so the screens and the test draw
 * with one copy of React.
 */
export async function screens<T>(source: string): Promise<T> {
  const built = await build({
    stdin: {
      contents: source,
      resolveDir: join(ROOT, "app", "src"),
      loader: "tsx",
      sourcefile: "screens.tsx",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
    define: { "import.meta.env.BASE_URL": '"/"' },
    write: false,
    logLevel: "silent",
  });
  const text = built.outputFiles[0]?.text ?? "";
  const folder = join(ROOT, "dist", "screens");
  await mkdir(folder, { recursive: true });
  const file = join(
    folder,
    `${createHash("sha256").update(text).digest("hex").slice(0, 16)}.mjs`,
  );
  await writeFile(file, text);
  return (await import(pathToFileURL(file).href)) as T;
}

/** The links of a rendered page, each with its address, its text, its `rel` and whether it marks the page shown. */
export function linksOf(markup: string) {
  return [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(
    ([, attributes = "", inner = ""]) => ({
      href: /\bhref="([^"]*)"/.exec(attributes)?.[1]?.replaceAll("&amp;", "&"),
      rel: /\brel="([^"]*)"/.exec(attributes)?.[1],
      current: /\baria-current="page"/.test(attributes),
      text: textOf(inner),
    }),
  );
}

/** The page's text, its tags dropped and its runs of white space one space. */
export const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim();

/** Whether the page links to `href` with `text`. */
export const links = (page: string, href: string, text: string): boolean =>
  linksOf(page).some((link) => link.href === href && link.text === text);

/** How many rows of data the page's tables hold, their heading rows not counted. */
export const rowsIn = (page: string): number =>
  page.split(/<tr\b/).filter((row) => /<td\b/.test(row)).length;

/** The text of the element with `id`. */
export const textAt = (page: string, id: string): string | undefined => {
  const tag = new RegExp(
    `<(\\w+)\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`,
  );
  const inner = tag.exec(page)?.[2];
  return inner === undefined ? undefined : textOf(inner);
};

/** The text of each element the page marks as the current one. */
export const currentIn = (page: string): string[] =>
  [
    ...page.matchAll(
      /<(\w+)\b[^>]*\baria-current="true"[^>]*>([\s\S]*?)<\/\1>/g,
    ),
  ].map(([, , inner]) => textOf(inner ?? ""));

const PAGES = `
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AskProvider } from "./ask.tsx";
import { ClassesPage } from "./classes.tsx";
import { EntryPage } from "./entry.tsx";
import { PanelPage } from "./panel.tsx";
import { PodPage } from "./pod.tsx";
import { TrendPage } from "./trend.tsx";
const pages = { ClassesPage, EntryPage, PanelPage, PodPage, TrendPage };
export const markup = (page, props, ask = false) =>
  renderToStaticMarkup(
    createElement(AskProvider, { value: ask }, createElement(pages[page], props)),
  );
`;

/**
 * A page's name and the props it is drawn from, to the markup it draws, with the app under the base `/`; with `ask`,
 * as it draws once the chat names a model.
 */
export type Markup = (
  page: "ClassesPage" | "EntryPage" | "PanelPage" | "PodPage" | "TrendPage",
  props: object,
  ask?: boolean,
) => string;

let bundled: Promise<Markup> | undefined;

/** The read-only screens' pages, bundled once however many tests ask. */
export function pages(): Promise<Markup> {
  bundled ??= screens<{ markup: Markup }>(PAGES).then(({ markup }) => markup);
  return bundled;
}
