// The app's React screens drawn to markup for a test: they are TSX, which Node does not run, so the screens are bundled
// once with esbuild and `react-dom/server` draws them from the props a screen would be given.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const APP = fileURLToPath(new URL("../../app/", import.meta.url));

const SOURCE = `
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClassesPage } from "./src/classes.tsx";
import { EntryPage } from "./src/entry.tsx";
import { PanelPage } from "./src/panel.tsx";
import { TrendPage } from "./src/trend.tsx";
const screens = { ClassesPage, EntryPage, PanelPage, TrendPage };
export const markup = (screen, props) =>
  renderToStaticMarkup(createElement(screens[screen], props));
`;

/** A screen's name and the props its page is drawn from, to the markup it draws, with the app under the base `/`. */
export type Markup = (
  screen: "ClassesPage" | "EntryPage" | "PanelPage" | "TrendPage",
  props: object,
) => string;

let bundled: Promise<Markup> | undefined;

/** The screens' markup, bundled on the first call. */
export function screens(): Promise<Markup> {
  bundled ??= (async () => {
    const built = await build({
      stdin: { contents: SOURCE, resolveDir: APP, loader: "js" },
      bundle: true,
      platform: "node",
      format: "cjs",
      jsx: "automatic",
      define: { "import.meta.env.BASE_URL": '"/"' },
      write: false,
      logLevel: "silent",
    });
    const folder = await mkdtemp(join(tmpdir(), "screens-"));
    try {
      const file = join(folder, "screens.cjs");
      await writeFile(file, built.outputFiles[0]!.text);
      return (createRequire(file)(file) as { markup: Markup }).markup;
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  })();
  return bundled;
}
