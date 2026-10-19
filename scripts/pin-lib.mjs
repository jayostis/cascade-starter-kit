// What scripts/pin.mjs decides, apart from the files and npm it touches.

// npm installs a workspace's changed dependency under the workspace, out of the root's reach, unless the lock has
// forgotten where the old one was.
export function lockWithoutRuntime(lock) {
  const packages = Object.fromEntries(
    Object.entries(lock.packages).filter(
      ([path]) => !/(^|\/)node_modules\/cascade-runtime(\/|$)/.test(path),
    ),
  );
  return { ...lock, packages };
}

export async function releaseAnswers(address) {
  const response = await globalThis.fetch(address, { method: "HEAD" });
  return response.ok;
}

// The pin moved onto `commit`; refused, with nothing written, when runtime-js has no such build.
export async function pinnedTo(pin, commit, releaseExists = releaseAnswers) {
  const pinned =
    /\/build-([0-9a-f]{40})\/cascade-runtime-0\.0\.0-commit-\1\.tgz$/.exec(pin);
  if (pinned === null)
    throw new Error(`the pin ${pin} is no build-<commit> tarball`);
  const moved = pin.replaceAll(pinned[1], commit);
  if (!(await releaseExists(moved)))
    throw new Error(`runtime-js has no release build-${commit}`);
  return moved;
}
