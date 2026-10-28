export interface Chunk {
  id: string; // "<doc slug>#<n>"
  doc: string;
  title: string;
  source: string;
  text: string;
}

const TARGET_CHARS = 900;

// Packs consecutive paragraphs into chunks of about TARGET_CHARS, never splitting a paragraph,
// and repeats the previous paragraph at the start of the next chunk so context isn't cut mid-thought.
export function chunkDocument(doc: string, raw: string): Chunk[] {
  const [header, ...rest] = raw.split("\n---\n");
  const meta = Object.fromEntries(
    header.split("\n").map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]),
  );
  const paragraphs = rest
    .join("\n---\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      id: `${doc}#${chunks.length}`,
      doc,
      title: meta.title,
      source: meta.source,
      text: current.join("\n\n"),
    });
  };

  for (const paragraph of paragraphs) {
    const size = current.reduce((n, p) => n + p.length, 0);
    if (size > 0 && size + paragraph.length > TARGET_CHARS) {
      flush();
      current = [current[current.length - 1]];
    }
    current.push(paragraph);
  }
  flush();
  return chunks;
}
