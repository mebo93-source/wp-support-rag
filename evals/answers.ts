// End-to-end answer eval: retrieve, answer with the model under test, grade.
// Usage: npm run eval:answers -- [--reps 2] [--limit 5]
// Writes evals/results/answers.jsonl (one row per case and rep), errors.jsonl and answers.md.
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { AnswerError, answerQuestion } from "../src/answer.ts";
import { ANSWER_MODEL, PRICES, RESULTS_DIR } from "../src/config.ts";
import { Retriever } from "../src/retrieve.ts";
import { loadCases, type Case } from "./cases.ts";
import { judgeAnswer } from "./judge.ts";

const { values } = parseArgs({ options: { reps: { type: "string", default: "1" }, limit: { type: "string" } } });
const REPS = Number(values.reps);
const CONCURRENCY = 4;

const allCases = await loadCases();
const cases = values.limit ? allCases.slice(0, Number(values.limit)) : allCases;
const retriever = await Retriever.load();

interface Row {
  case: string;
  rep: number;
  tags: string[];
  expected_answerable: boolean;
  answerable: boolean;
  answer: string;
  citations: string[];
  served_model: string;
  // Answerable cases only:
  facts_covered?: number;
  facts_total?: number;
  unsupported_claims?: string[];
  fact_verdicts?: { index: number; covered: boolean; reason: string }[];
  cited_gold_doc?: boolean;
  citation_precision?: number | null;
  pass: boolean;
  cost_usd: number;
  judge_cost_usd: number;
}

const rows: Row[] = [];
const errors: object[] = [];

async function runOne(c: Case, rep: number) {
  const hits = await retriever.search(c.question);
  let result;
  try {
    result = await answerQuestion(c.question, hits);
  } catch (e) {
    // Infrastructure and format failures are kept apart from graded answers.
    const kind = e instanceof AnswerError ? e.kind : e instanceof Anthropic.APIError ? `api_${e.status ?? "connection"}` : "harness";
    errors.push({ case: c.id, rep, kind, message: String(e instanceof Error ? e.message : e) });
    return;
  }
  const { answer, usage, model } = result;
  const row: Row = {
    case: c.id,
    rep,
    tags: c.tags,
    expected_answerable: c.answerable,
    answerable: answer.answerable,
    answer: answer.answer,
    citations: answer.citations,
    served_model: model,
    pass: false,
    cost_usd: cost(model, usage),
    judge_cost_usd: 0,
  };

  if (!c.answerable) {
    row.pass = !answer.answerable;
  } else if (answer.answerable) {
    const cited = hits.filter((h) => answer.citations.includes(h.chunk.id));
    const goldCited = cited.filter((h) => c.gold_docs.includes(h.chunk.doc)).length;
    row.cited_gold_doc = goldCited > 0;
    row.citation_precision = cited.length ? goldCited / cited.length : null;
    const excerpts = hits.map((h) => `[${h.chunk.id}]\n${h.chunk.text}`).join("\n\n");
    try {
      const judged = await judgeAnswer(c.question, answer.answer, c.facts, excerpts);
      row.facts_covered = judged.verdict.facts.filter((f) => f.covered).length;
      row.facts_total = c.facts.length;
      row.unsupported_claims = judged.unsupported;
      row.fact_verdicts = judged.verdict.facts;
      row.judge_cost_usd = cost(judged.model, judged.usage);
    } catch (e) {
      errors.push({ case: c.id, rep, kind: "judge", message: String(e instanceof Error ? e.message : e) });
      return;
    }
    row.pass = row.facts_covered === row.facts_total && row.unsupported_claims.length === 0 && row.cited_gold_doc;
  } else {
    // The model abstained on a question the docs do answer.
    row.facts_covered = 0;
    row.facts_total = c.facts.length;
    row.pass = false;
  }
  rows.push(row);
  console.log(`${row.pass ? "PASS" : "FAIL"} ${c.id} rep ${rep}`);
}

const jobs = cases.flatMap((c) => Array.from({ length: REPS }, (_, rep) => () => runOne(c, rep)));
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let job = jobs.shift(); job; job = jobs.shift()) await job();
}));

function cost(model: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  const p = PRICES[model];
  if (!p) return NaN;
  return (
    usage.input_tokens * p.input +
    usage.output_tokens * p.output +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite
  ) / 1e6;
}

// Wilson score interval for a pass rate.
function wilson(passes: number, n: number) {
  if (n === 0) return [0, 0];
  const z = 1.96, p = passes / n, d = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [center - half, center + half];
}

const answerable = rows.filter((r) => r.expected_answerable);
const unanswerable = rows.filter((r) => !r.expected_answerable);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const rate = (list: Row[], f: (r: Row) => boolean) => (list.length ? list.filter(f).length / list.length : 0);
const passes = rows.filter((r) => r.pass).length;
const [lo, hi] = wilson(passes, rows.length);
const factsCovered = answerable.reduce((n, r) => n + (r.facts_covered ?? 0), 0);
const factsTotal = answerable.reduce((n, r) => n + (r.facts_total ?? 0), 0);
const precisions = answerable.map((r) => r.citation_precision).filter((x): x is number => typeof x === "number");
const mismatched = rows.filter((r) => r.served_model !== ANSWER_MODEL);

const summary = [
  `Answer eval: ${cases.length} cases × ${REPS} rep(s), model under test \`${ANSWER_MODEL}\`, judge \`claude-haiku-5-5\`.`,
  "",
  "| Metric | Result |",
  "|---|---|",
  `| Overall pass rate | ${pct(passes / Math.max(1, rows.length))} (${passes}/${rows.length}; 95% CI ${pct(lo)}–${pct(hi)}) |`,
  `| Required facts covered (answerable) | ${pct(factsCovered / Math.max(1, factsTotal))} (${factsCovered}/${factsTotal}) |`,
  `| Answers with unsupported claims | ${pct(rate(answerable.filter((r) => r.answerable), (r) => (r.unsupported_claims?.length ?? 0) > 0))} |`,
  `| Cited a gold document | ${pct(rate(answerable.filter((r) => r.answerable), (r) => r.cited_gold_doc === true))} |`,
  `| Citation precision | ${pct(precisions.reduce((a, b) => a + b, 0) / Math.max(1, precisions.length))} |`,
  `| Wrongly abstained (answerable questions) | ${pct(rate(answerable, (r) => !r.answerable))} |`,
  `| Correctly abstained (unanswerable questions) | ${pct(rate(unanswerable, (r) => !r.answerable))} (${unanswerable.filter((r) => !r.answerable).length}/${unanswerable.length}) |`,
  `| Errors (not graded) | ${errors.length} |`,
  `| Cost: answers / judge | $${rows.reduce((n, r) => n + r.cost_usd, 0).toFixed(3)} / $${rows.reduce((n, r) => n + r.judge_cost_usd, 0).toFixed(3)} |`,
  ...(mismatched.length ? [`| Served by a fallback model | ${mismatched.length} rows |`] : []),
].join("\n");

await fs.mkdir(RESULTS_DIR, { recursive: true });
await fs.writeFile(path.join(RESULTS_DIR, "answers.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
await fs.writeFile(path.join(RESULTS_DIR, "errors.jsonl"), errors.map((e) => JSON.stringify(e)).join("\n") + (errors.length ? "\n" : ""));
await fs.writeFile(path.join(RESULTS_DIR, "answers.md"), summary + "\n");
console.log("\n" + summary);
