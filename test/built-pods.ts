import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { loadHospital } from "@the-cascade-protocol/sandbox/node";
import { openPod, pullFiles } from "cascade-runtime";
import { pulled } from "./hospitals.js";

/** The folder one `npm test` run builds each story pod in once; the tests' processes share it. */
const cache = (() => {
  const given = process.env.STARTER_TEST_CACHE;
  if (given !== undefined) return given;
  const own = mkdtempSync(join(tmpdir(), "starter-built-"));
  process.on("exit", () => rmSync(own, { recursive: true, force: true }));
  return own;
})();

async function build(patient: string, at: string): Promise<void> {
  const { pull } = await pulled(await loadHospital("cascade-north"), patient);
  const pod = await openPod(at);
  try {
    const imported = await pod.import(pullFiles(pull, "north"), {
      aboutSubject: true,
    });
    assert.equal(imported.refused, undefined, patient);
  } finally {
    await pod.close();
  }
}

/** The story patient's pod, brought in from North by the first process that asks and kept read-only for the rest. */
async function built(patient: string): Promise<string> {
  const kept = join(cache, patient);
  const claim = `${kept}.claimed`;
  await mkdir(cache, { recursive: true });
  let mine = true;
  try {
    await mkdir(claim);
  } catch {
    mine = false;
  }
  if (mine && !existsSync(kept)) {
    const building = join(cache, `${patient}.building`, patient);
    await mkdir(join(cache, `${patient}.building`), { recursive: true });
    await build(patient, building);
    await rename(building, kept);
  }
  for (let waited = 0; !existsSync(kept); waited += 100) {
    assert.ok(waited < 5 * 60_000, `${patient} was never built`);
    await sleep(100);
  }
  return kept;
}

const memo = new Map<string, Promise<string>>();

/** The story patient's pod as brought in from North, copied to `at`. */
export async function storyPodAt(patient: string, at: string): Promise<void> {
  if (!memo.has(patient)) memo.set(patient, built(patient));
  await cp(await memo.get(patient)!, at, { recursive: true });
}

/** A pod of its own in a new folder, a copy of the story patient's pod as brought in from North. Remove `parent` after. */
export async function storyPodIn(
  patient: string,
): Promise<{ parent: string; pod: ReturnType<typeof openPod> }> {
  const parent = await mkdtemp(join(tmpdir(), "starter-copy-"));
  const at = join(parent, patient);
  await storyPodAt(patient, at);
  return { parent, pod: openPod(at) };
}

/** Removes what `storyPodIn` made, once its pod is closed. */
export async function removedCopy(parent: string): Promise<void> {
  await rm(parent, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
