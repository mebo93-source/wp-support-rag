import fs from "node:fs/promises";
import { BM25 } from "./bm25.ts";
import type { Chunk } from "./chunk.ts";
import { INDEX_PATH } from "./config.ts";
import { cosine, embed } from "./embed.ts";

export type Method = "bm25" | "dense" | "hybrid";

export interface Hit {
  chunk: Chunk;
  score: number;
}

interface IndexFile {
  embeddingModel: string;
  chunks: (Chunk & { vector: number[] })[];
}

// Reciprocal Rank Fusion constant; 60 is the value from the original RRF paper.
const RRF_K = 60;

export class Retriever {
  private constructor(
    private chunks: (Chunk & { vector: number[] })[],
    private bm25: BM25,
  ) {}

  static async load(): Promise<Retriever> {
    const index = JSON.parse(await fs.readFile(INDEX_PATH, "utf8")) as IndexFile;
    return new Retriever(index.chunks, new BM25(index.chunks.map((c) => `${c.title}\n${c.text}`)));
  }

  async search(query: string, k = 6, method: Method = "hybrid"): Promise<Hit[]> {
    const lexical = this.bm25.scores(query);
    const [queryVector] = await embed([query]);
    const dense = this.chunks.map((c) => cosine(queryVector, c.vector));

    let scores: number[];
    if (method === "bm25") scores = lexical;
    else if (method === "dense") scores = dense;
    else {
      const lexicalRank = ranks(lexical);
      const denseRank = ranks(dense);
      scores = this.chunks.map((_, i) => 1 / (RRF_K + lexicalRank[i]) + 1 / (RRF_K + denseRank[i]));
    }

    return scores
      .map((score, i) => ({ chunk: stripVector(this.chunks[i]), score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

// 1-based rank of each position when sorted by descending score.
function ranks(scores: number[]): number[] {
  const order = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
  const rank = new Array<number>(scores.length);
  order.forEach(([, i], position) => (rank[i] = position + 1));
  return rank;
}

function stripVector({ vector: _vector, ...chunk }: Chunk & { vector: number[] }): Chunk {
  return chunk;
}
