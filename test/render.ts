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
  return [...markup.matchAll(/<a ([^>]*)>([^<]*)</g)].map(
    ([, attributes = "", text = ""]) => ({
      href: /href="([^"]*)"/.exec(attributes)?.[1]?.replaceAll("&amp;", "&"),
      rel: /rel="([^"]*)"/.exec(attributes)?.[1],
      current: /aria-current="page"/.test(attributes),
      text,
    }),
  );
}

/** The page's text, its tags dropped and its runs of white space one space. */
export const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim();
