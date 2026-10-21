import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** What the app's pages are built from, by their paths in the app; the lock file is the workspace's, above it. */
const SOURCES = [
  "index.html",
  "src",
  "said.ts",
  "addresses.ts",
  "vite.config.ts",
  "vite",
  "package.json",
  "package-lock.json",
  "../package-lock.json",
  "tsconfig.json",
];

/** The settings baked into the pages. */
const SETTINGS = ["CASCADE_NAME", "CASCADE_VERSION", "CASCADE_CODE"] as const;

/** The file in `dist/` that records the settings the last build used. */
const BUILT_WITH = ".built-with.json";

/** When the newest file at `path` was written, a folder's files included; 0 when there is none. */
function newest(path: string): number {
  if (!existsSync(path)) return 0;
  const stats = statSync(path);
  if (!stats.isDirectory()) return stats.mtimeMs;
  return Math.max(
    0,
    ...readdirSync(path, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => statSync(join(entry.parentPath, entry.name)).mtimeMs),
  );
}

/**
 * Runs `build` when `dist/` of the app at `app` has no pages, a file they are built from was written since, or the
 * settings in `env` are not the ones the last build used; says whether it did.
 */
export async function builtPages(
  app: string,
  build: () => Promise<void>,
  env: Record<string, string | undefined>,
): Promise<boolean> {
  const dist = join(app, "dist");
  const built = newest(join(dist, "index.html"));
  const used = join(dist, BUILT_WITH);
  const settings = JSON.stringify(SETTINGS.map((name) => env[name] ?? null));
  if (
    built > 0 &&
    SOURCES.every((path) => newest(join(app, path)) <= built) &&
    existsSync(used) &&
    readFileSync(used, "utf8") === settings
  )
    return false;
  await build();
  writeFileSync(used, settings);
  return true;
}
