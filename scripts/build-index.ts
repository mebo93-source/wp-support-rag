// Chunks every document in data/docs and stores the chunks with their embeddings in data/index.json.
import fs from "node:fs/promises";
import path from "node:path";
import { chunkDocument, type Chunk } from "../src/chunk.ts";
import { DOCS_DIR, EMBEDDING_MODEL, INDEX_PATH } from "../src/config.ts";
import { embed } from "../src/embed.ts";

const files = (await fs.readdir(DOCS_DIR)).filter((f) => f.endsWith(".md")).sort();
const chunks: Chunk[] = [];
for (const file of files) {
  chunks.push(...chunkDocument(path.basename(file, ".md"), await fs.readFile(path.join(DOCS_DIR, file), "utf8")));
}

const vectors = await embed(chunks.map((c) => `${c.title}\n${c.text}`));
await fs.writeFile(
  INDEX_PATH,
  JSON.stringify({ embeddingModel: EMBEDDING_MODEL, chunks: chunks.map((c, i) => ({ ...c, vector: vectors[i] })) }),
);
console.log(`indexed ${chunks.length} chunks from ${files.length} documents`);
