// The template with every add-on added, as create adds them, in build/app/: what the repository's suites run the chat
// and the MCP server on. Its node_modules is app/'s, so it resolves what the template does. Run after `tsc -b`.
import { existsSync, lstatSync } from "node:fs";
import { cp, rm, symlink, unlink } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { addOn, addOns, LEFT_OUT } from "../dist/create/src/create.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TEMPLATE = join(ROOT, "app");
const APPLIED = join(ROOT, "build", "app");
const MODULES = join(APPLIED, "node_modules");

if (existsSync(MODULES) && lstatSync(MODULES).isSymbolicLink())
  await unlink(MODULES);
await rm(APPLIED, { recursive: true, force: true });
await cp(TEMPLATE, APPLIED, {
  recursive: true,
  filter: (source) =>
    ![...LEFT_OUT, "test-results"].includes(relative(TEMPLATE, source)),
});
for (const each of await addOns()) await addOn(APPLIED, each);
if (existsSync(join(TEMPLATE, "node_modules")))
  await symlink(join(TEMPLATE, "node_modules"), MODULES, "junction");
