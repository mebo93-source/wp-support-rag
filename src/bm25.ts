// Okapi BM25 over the chunk texts. Small enough to keep in memory and rebuild on every start.
const K1 = 1.2;
const B = 0.75;

const STOPWORDS = new Set(
  "a an and are as at be by can do does for from how i if in is it its my of on or so that the this to was what when where which who why will with you your".split(" "),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9.\- ]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export class BM25 {
  private docs: Map<string, number>[] = [];
  private lengths: number[] = [];
  private df = new Map<string, number>();
  private avgLength = 0;

  constructor(texts: string[]) {
    for (const text of texts) {
      const tf = new Map<string, number>();
      const tokens = tokenize(text);
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push(tf);
      this.lengths.push(tokens.length);
    }
    this.avgLength = this.lengths.reduce((a, b) => a + b, 0) / Math.max(1, this.lengths.length);
  }

  scores(query: string): number[] {
    const n = this.docs.length;
    const terms = [...new Set(tokenize(query))];
    return this.docs.map((tf, i) => {
      let score = 0;
      for (const term of terms) {
        const f = tf.get(term);
        if (!f) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * this.lengths[i]) / this.avgLength));
      }
      return score;
    });
  }
}
