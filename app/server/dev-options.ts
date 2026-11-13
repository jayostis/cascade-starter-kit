import type { InlineConfig } from "vite";

/** `folder` as a glob for everything under it: a character a glob reads is a class of its own, so no path changes it. */
export const under = (folder: string) =>
  `${folder.replaceAll("\\", "/").replace(/[*?[\]{}()!+@|]/g, "[$&]")}**`;

/**
 * The options of development's Vite, which never serves a pod, at `/pods/` or at `/@fs/`, never watches one (a pod write
 * sends its path to every page that holds the HMR socket and reloads the page), and keeps its HMR socket on loopback.
 * A `deny` of ours replaces Vite's own list, so it is read and kept; it is read with `configFile: false`, so a `deny` in
 * `vite.config.ts` would be added to the list the server has, not replace it.
 */
export async function devOptions(
  root: string,
  pods: string,
): Promise<InlineConfig> {
  const { resolveConfig } = await import("vite");
  const { server } = await resolveConfig({ root, configFile: false }, "serve");
  return {
    root,
    server: {
      middlewareMode: true,
      fs: { deny: [...server.fs.deny, under(pods), "**/.answers/**"] },
      watch: { ignored: [under(pods)] },
      hmr: { host: "127.0.0.1" },
    },
    appType: "spa",
  };
}
