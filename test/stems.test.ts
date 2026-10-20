import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as oxigraph from "oxigraph";
import { kitFolder } from "cascade-runtime/fixtures";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RECORDS = "ontologies/records/v1-draft/records.ttl";
const REC = "https://ns.cascadeprotocol.org/records/v1-draft#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const URI_SPACE = "http://rdfs.org/ns/void#uriSpace";

const STEMS = [
  "snomed.info/sct/",
  "loinc.org/",
  "umls/rxnorm",
  "hl7.org/fhir/sid/ndc/",
  "ns.cascadeprotocol.org/codes/",
  "varnomen.hgvs.org/",
  "ncbi.nlm.nih.gov/clinvar/",
];

/** The URI space of each code system the installed package's vocabulary registers. */
async function registered(): Promise<string[]> {
  const vocabulary = join(await kitFolder("alex-rivera"), "..", "..");
  const triples = oxigraph.parse(
    await readFile(join(vocabulary, RECORDS), "utf8"),
    { format: "text/turtle", base_iri: `file:///${RECORDS}` },
  );
  const systems = new Set(
    triples
      .filter(
        ({ predicate, object }) =>
          predicate.value === RDF_TYPE && object.value === `${REC}CodeSystem`,
      )
      .map(({ subject }) => subject.value),
  );
  const spaces = triples
    .filter(
      ({ subject, predicate }) =>
        systems.has(subject.value) && predicate.value === URI_SPACE,
    )
    .map(({ object }) => object.value);
  assert.equal(spaces.length, systems.size, "a code system has no URI space");
  return spaces;
}

test("no source writes a code system's IRI stem: the starter reads each from the vocabulary", async () => {
  const sources = [
    ...(await readdir(join(ROOT, "app"), { recursive: true }))
      .map((name) => name.replaceAll("\\", "/"))
      .filter(
        (name) =>
          /\.(mjs|ts|tsx)$/.test(name) &&
          !/^(node_modules|dist|pods)\//.test(name),
      )
      .map((name) => `app/${name}`),
    ...(await readdir(join(ROOT, "try")))
      .filter((name) => name.endsWith(".js"))
      .map((name) => `try/${name}`),
    ...(await readdir(join(ROOT, "try", "build")))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `try/build/${name}`),
    ...(await readdir(join(ROOT, "create", "src")))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `create/src/${name}`),
  ];
  assert.ok(sources.includes("app/summary.mjs"));
  assert.ok(sources.includes("app/said.ts"));
  assert.ok(sources.includes("app/src/pod.tsx"));
  assert.ok(sources.includes("try/app.js"));
  assert.ok(sources.includes("try/build/try.ts"));
  assert.ok(sources.includes("create/src/create.ts"));
  const spaces = (await registered()).map((space) =>
    space.replace(/^[a-z]+:\/\//, ""),
  );
  assert.ok(spaces.length > 0, "the vocabulary registers no code system");
  const writing: string[] = [];
  for (const path of sources) {
    const text = await readFile(join(ROOT, path), "utf8");
    for (const stem of [...STEMS, ...spaces])
      if (text.includes(stem)) writing.push(`${path} writes ${stem}`);
  }
  assert.deepEqual(writing, []);
});
