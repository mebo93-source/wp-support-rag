import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DOCS_DIR = path.join(ROOT, "data", "docs");
export const INDEX_PATH = path.join(ROOT, "data", "index.json");
export const RESULTS_DIR = path.join(ROOT, "evals", "results");

// Model under test answers questions; a different, cheaper model grades the answers.
export const ANSWER_MODEL = "claude-opus-5-5";
export const JUDGE_MODEL = "claude-haiku-5-5";
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

// USD per million tokens, used to report the cost of each eval run.
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

// Support-oriented articles from the official WordPress documentation (wordpress.org/documentation).
export const ARTICLE_SLUGS = [
  "recovery-mode", "site-health-screen", "plugins-themes-auto-updates", "why-should-i-use-https",
  "wordpress-site-maintenance", "wordpress-housekeeping", "faq-i-make-changes-and-nothing-happens",
  "settings-privacy-screen", "understand-comment-spam", "comment-moderation", "protect-posts-with-password",
  "revisions", "tools-export-screen", "tools-erase-personal-data-screen", "tools-export-personal-data-screen",
  "tools-import-screen", "users-add-new-screen", "roles-and-capabilities", "create-a-static-front-page",
  "customize-permalinks", "settings-permalinks-screen", "reset-your-password", "faq-troubleshooting",
  "troubleshoot-login-issues", "hosting-wordpress", "image-size-and-quality", "search-engine-optimization",
  "updating-wordpress", "password-best-practices", "faq-my-site-was-hacked", "manage-plugins",
  "settings-general-screen", "settings-reading-screen", "settings-discussion-screen", "faq-installation",
  "block-error-unexpected-or-invalid-content", "settings-media-screen",
];
