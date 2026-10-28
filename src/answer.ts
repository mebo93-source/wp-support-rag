import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ANSWER_MODEL } from "./config.ts";
import type { Hit } from "./retrieve.ts";

export const AnswerSchema = z.object({
  answerable: z.boolean().describe("false when the excerpts do not contain the answer"),
  answer: z.string().describe("the reply to the user, or a short note that the docs don't cover it"),
  citations: z.array(z.string()).describe("ids of the excerpts the answer relies on, e.g. recovery-mode#2"),
});
export type Answer = z.infer<typeof AnswerSchema>;

export interface AnswerResult {
  answer: Answer;
  model: string;
  stopReason: string | null;
  usage: Anthropic.Beta.BetaUsage;
}

// Stable across requests so the prompt prefix can be cached.
const SYSTEM = `You are a WordPress support assistant. You answer site owners' questions using only the documentation excerpts provided with each question.

Rules:
- Use only facts stated in the excerpts. If they don't contain the answer, set answerable to false and say briefly that the documentation provided doesn't cover it. Don't fill gaps from general knowledge.
- Give practical steps in the order the user would do them, using the admin screen names from the excerpts (for example Settings > Permalinks).
- Cite every excerpt you rely on by its id. Never cite an excerpt you didn't use.
- Keep the answer under 150 words, in plain language for a non-technical site owner.`;

const client = new Anthropic();

export async function answerQuestion(question: string, hits: Hit[]): Promise<AnswerResult> {
  const excerpts = hits
    .map((h) => `<excerpt id="${h.chunk.id}" title="${h.chunk.title}">\n${h.chunk.text}\n</excerpt>`)
    .join("\n\n");

  const response = await client.beta.messages.parse({
    model: ANSWER_MODEL,
    max_tokens: 16000,
    // On a safety decline, the API re-runs the request on a fallback model it picks by refusal category.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(AnswerSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `${excerpts}\n\nQuestion: ${question}` }],
  });

  if (response.stop_reason === "refusal") throw new AnswerError("refusal", "the model declined the question");
  if (response.stop_reason === "max_tokens") throw new AnswerError("truncated", "the answer hit max_tokens");
  if (!response.parsed_output) throw new AnswerError("unparseable", "the answer did not match the schema");

  // Only keep citations that point at excerpts we actually sent.
  const sent = new Set(hits.map((h) => h.chunk.id));
  const answer = { ...response.parsed_output, citations: response.parsed_output.citations.filter((c) => sent.has(c)) };
  return { answer, model: response.model, stopReason: response.stop_reason, usage: response.usage };
}

export class AnswerError extends Error {
  constructor(
    readonly kind: "refusal" | "truncated" | "unparseable",
    message: string,
  ) {
    super(message);
  }
}
