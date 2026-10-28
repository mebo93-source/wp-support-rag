// Sanity check for the grader before trusting its numbers. On a sample of cases:
// - an oracle answer built from the gold evidence must cover every fact with no unsupported claims;
// - an empty answer, "I don't know" and an answer to a different question must cover none.
import { DOCS_DIR } from "../src/config.ts";
import { loadCases } from "./cases.ts";
import { judgeAnswer } from "./judge.ts";
import fs from "node:fs/promises";
import path from "node:path";

const cases = (await loadCases()).filter((c) => c.answerable).slice(0, 6);
let failures = 0;

for (const [i, c] of cases.entries()) {
  const excerpts = (await Promise.all(c.gold_docs.map((d) => fs.readFile(path.join(DOCS_DIR, `${d}.md`), "utf8")))).join("\n\n");
  const other = cases[(i + 1) % cases.length];
  const probes = [
    { name: "oracle", answer: c.facts.map((f) => f.fact).join(" "), expectAll: true },
    { name: "empty", answer: "", expectAll: false },
    { name: "dont-know", answer: "I don't know, sorry.", expectAll: false },
    { name: "wrong-question", answer: other.facts.map((f) => f.evidence).join(" "), expectAll: false },
  ];
  for (const probe of probes) {
    const { verdict, unsupported } = await judgeAnswer(c.question, probe.answer, c.facts, excerpts);
    const covered = verdict.facts.filter((f) => f.covered).length;
    const ok = probe.expectAll
      ? covered === c.facts.length && unsupported.length === 0
      : covered === 0;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.id} ${probe.name}: ${covered}/${c.facts.length} facts, ${unsupported.length} unsupported`);
  }
}

console.log(failures ? `\n${failures} probe(s) failed: fix the judge before running the answer eval.` : "\nJudge passed every probe.");
process.exitCode = failures ? 1 : 0;
