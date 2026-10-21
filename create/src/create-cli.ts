#!/usr/bin/env node
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { create, fixturesOf, npmInstall, npmRunModel } from "./create.js";

async function question(text: string): Promise<string> {
  const reading = createInterface({ input: stdin, output: stdout });
  try {
    return await reading.question(text);
  } finally {
    reading.close();
  }
}

async function chooseAddOns(
  addOns: readonly { name: string; description: string }[],
): Promise<string[]> {
  const width = Math.max(...addOns.map(({ name }) => name.length));
  stdout.write(
    `\nThe add-ons:\n\n${addOns.map(({ name, description }) => `  ${name.padEnd(width)}  ${description}\n`).join("")}\n`,
  );
  const answer = await question(
    "Which to add, by name and separated by commas? Enter alone adds none: ",
  );
  return answer.split(",");
}

async function offerModel(folder: string): Promise<boolean> {
  const answer = (
    await question("\nChoose the model the chat uses now? (y/N) ")
  )
    .trim()
    .toLowerCase();
  return (answer === "y" || answer === "yes") && (await npmRunModel(folder));
}

process.exitCode = await create(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  ...(stdin.isTTY
    ? {
        ask: () => question("A name for the app's folder: "),
        choose: chooseAddOns,
        model: offerModel,
      }
    : {}),
  install: npmInstall,
  fixtures: fixturesOf,
});
