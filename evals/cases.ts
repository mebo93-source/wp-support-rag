import fs from "node:fs/promises";
import path from "node:path";
import { DOCS_DIR, ROOT } from "../src/config.ts";

export interface Fact {
  fact: string;
  evidence: string; // verbatim quote from a gold doc
}

export interface Case {
  id: string;
  question: string;
  answerable: boolean;
  gold_docs: string[];
  facts: Fact[];
  tags: string[];
}

// Loads evals/cases.jsonl and fails loudly if any case is malformed or its evidence
// can't be found word for word in a gold document.
export async function loadCases(): Promise<Case[]> {
  const raw = await fs.readFile(path.join(ROOT, "evals", "cases.jsonl"), "utf8");
  const cases = raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Case);

  const problems: string[] = [];
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) problems.push(`${c.id}: duplicate id`);
    ids.add(c.id);
    if (c.answerable && (c.gold_docs.length === 0 || c.facts.length === 0)) problems.push(`${c.id}: answerable case without gold docs or facts`);
    if (!c.answerable && (c.gold_docs.length > 0 || c.facts.length > 0)) problems.push(`${c.id}: unanswerable case with gold docs or facts`);
    const texts = await Promise.all(
      c.gold_docs.map((d) => fs.readFile(path.join(DOCS_DIR, `${d}.md`), "utf8").catch(() => null)),
    );
    c.gold_docs.forEach((d, i) => texts[i] === null && problems.push(`${c.id}: missing doc ${d}`));
    for (const f of c.facts) {
      if (!texts.some((t) => t?.includes(f.evidence))) problems.push(`${c.id}: evidence not found verbatim: "${f.evidence.slice(0, 60)}…"`);
    }
  }
  if (problems.length) throw new Error(`Invalid eval cases:\n${problems.join("\n")}`);
  return cases;
}
