// Local sentence embeddings (no API key needed). The model downloads once and is cached by transformers.js.
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { EMBEDDING_MODEL } from "./config.ts";

let extractor: Promise<FeatureExtractionPipeline> | undefined;

export async function embed(texts: string[]): Promise<number[][]> {
  extractor ??= pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "fp32" });
  const model = await extractor;
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += 16) {
    const output = await model(texts.slice(i, i + 16), { pooling: "mean", normalize: true });
    vectors.push(...(output.tolist() as number[][]));
  }
  return vectors;
}

// Vectors are normalized, so the dot product is the cosine similarity.
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
