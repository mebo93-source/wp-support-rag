// Retrieval eval: no API calls. For every answerable case, checks where the gold documents
// land in the top-k results of each retrieval method.
import fs from "node:fs/promises";
import path from "node:path";
import { RESULTS_DIR } from "../src/config.ts";
import { Retriever, type Method } from "../src/retrieve.ts";
import { loadCases } from "./cases.ts";

const K = 6;
const METHODS: Method[] = ["bm25", "dense", "hybrid"];

const cases = (await loadCases()).filter((c) => c.answerable);
const retriever = await Retriever.load();

const rows: string[] = [];
const summary: Record<string, { hit: number; recall: number; mrr: number }> = {};

for (const method of METHODS) {
  let hit = 0, recall = 0, mrr = 0;
  for (const c of cases) {
    const docs = (await retriever.search(c.question, K, method)).map((h) => h.chunk.doc);
    const firstGold = docs.findIndex((d) => c.gold_docs.includes(d));
    const found = c.gold_docs.filter((g) => docs.includes(g)).length;
    hit += firstGold >= 0 ? 1 : 0;
    recall += found / c.gold_docs.length;
    mrr += firstGold >= 0 ? 1 / (firstGold + 1) : 0;
    rows.push(JSON.stringify({ method, case: c.id, first_gold_rank: firstGold + 1 || null, gold_found: found, gold_total: c.gold_docs.length, top_docs: docs }));
  }
  summary[method] = { hit: hit / cases.length, recall: recall / cases.length, mrr: mrr / cases.length };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const table = [
  `Retrieval over ${cases.length} answerable questions, top ${K} chunks.`,
  "",
  `| Method | Hit@${K} | Gold-doc recall@${K} | MRR |`,
  "|---|---|---|---|",
  ...METHODS.map((m) => `| ${m} | ${pct(summary[m].hit)} | ${pct(summary[m].recall)} | ${summary[m].mrr.toFixed(3)} |`),
].join("\n");

await fs.mkdir(RESULTS_DIR, { recursive: true });
await fs.writeFile(path.join(RESULTS_DIR, "retrieval.jsonl"), rows.join("\n") + "\n");
await fs.writeFile(path.join(RESULTS_DIR, "retrieval.md"), table + "\n");
console.log(table);
