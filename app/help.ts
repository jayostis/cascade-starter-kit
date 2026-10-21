// `npm run help`: every script of package.json, in its order, with what `help.json` says it does (an add-on adds its
// scripts' lines there); a script with no line shows its name alone.
import { readFile } from "node:fs/promises";
import { stdout } from "node:process";
import { URL } from "node:url";

const read = async <T>(file: string) =>
  JSON.parse(await readFile(new URL(file, import.meta.url), "utf8")) as T;

const said =
  await read<Readonly<Record<string, readonly [string, string]>>>("help.json");
const { scripts } = await read<{ scripts: Record<string, string> }>(
  "package.json",
);
const rows = Object.keys(scripts).map(
  (script) => said[script] ?? [`npm run ${script}`, ""],
);
const width = Math.max(...rows.map(([command]) => command.length));
stdout.write("The app's commands, run in this folder:\n\n");
for (const [command, what] of rows)
  stdout.write(`  ${command.padEnd(width)}  ${what}`.trimEnd() + "\n");
stdout.write(
  "\nAn option to a command goes after `--`, or npm keeps it for itself.\n",
);
