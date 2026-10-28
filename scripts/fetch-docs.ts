// Downloads the support articles from the WordPress documentation REST API and saves them as plain text.
// The corpus is not committed to the repo; run `npm run fetch` to rebuild it.
import fs from "node:fs/promises";
import path from "node:path";
import { convert } from "html-to-text";
import { ARTICLE_SLUGS, DOCS_DIR } from "../src/config.ts";

const API = "https://wordpress.org/documentation/wp-json/wp/v2/articles";

interface Article {
  slug: string;
  link: string;
  modified: string;
  title: { rendered: string };
  content: { rendered: string };
}

await fs.mkdir(DOCS_DIR, { recursive: true });

for (const slug of ARTICLE_SLUGS) {
  const res = await fetch(`${API}?slug=${slug}&_fields=slug,link,modified,title,content`);
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const [article] = (await res.json()) as Article[];
  if (!article) throw new Error(`${slug}: not found`);

  const title = convert(article.title.rendered);
  const body = convert(article.content.rendered, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "h1", options: { uppercase: false, prefix: "# " } },
      { selector: "h2", options: { uppercase: false, prefix: "## " } },
      { selector: "h3", options: { uppercase: false, prefix: "### " } },
      { selector: "h4", options: { uppercase: false, prefix: "#### " } },
      { selector: "table", format: "dataTable" },
    ],
  });
  const header = `title: ${title}\nsource: ${article.link}\nmodified: ${article.modified}\n---\n`;
  await fs.writeFile(path.join(DOCS_DIR, `${slug}.md`), header + body.trim() + "\n");
  console.log(`saved ${slug} (${body.length} chars)`);
}
