// Usage: npm run ask -- "How do I change my permalinks?"
import { answerQuestion } from "./answer.ts";
import { Retriever } from "./retrieve.ts";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error('Usage: npm run ask -- "your WordPress question"');
  process.exit(1);
}

const retriever = await Retriever.load();
const hits = await retriever.search(question);
const { answer } = await answerQuestion(question, hits);

console.log(`\n${answer.answer}\n`);
if (!answer.answerable) console.log("(Not covered by the indexed documentation.)");
for (const id of answer.citations) {
  const hit = hits.find((h) => h.chunk.id === id);
  if (hit) console.log(`  [${id}] ${hit.chunk.title} — ${hit.chunk.source}`);
}
