import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The folder of the installed `cascade-runtime` package, found from where its main entry resolves. */
export function runtimePackageRoot(): string {
  let folder = dirname(fileURLToPath(import.meta.resolve("cascade-runtime")));
  for (;;) {
    const file = join(folder, "package.json");
    if (
      existsSync(file) &&
      (JSON.parse(readFileSync(file, "utf8")) as { name?: string }).name ===
        "cascade-runtime"
    )
      return folder;
    const parent = dirname(folder);
    if (parent === folder)
      throw new Error(
        "No package.json named cascade-runtime was found above where cascade-runtime resolves; run npm install.",
      );
    folder = parent;
  }
}
