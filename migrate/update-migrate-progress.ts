import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

interface EntryStatus {
  entry: SlugMapItem;
  migrated: boolean;
  cpprefUrl: string;
  cppdocUrl: string;
  issueUrl: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isMigrated(entry: string): Promise<boolean> {
  // Possible paths
  const mdxPath = path.join(REPO_ROOT, "src/content/docs", `${entry}.mdx`);
  const indexPath = path.join(
    REPO_ROOT,
    "src/content/docs",
    entry,
    "index.mdx"
  );

  return (await fileExists(mdxPath)) || (await fileExists(indexPath));
}

function generateUrls(
  entry: SlugMapItem
): Omit<EntryStatus, "entry" | "migrated"> {
  const cpprefUrl = `http://en.cppreference.com/w/${entry.cppref}.html`;
  const cppdocUrl = `http://cppdoc.cc/${entry.cppdoc}`;
  const issueUrl = `https://github.com/cppdoc-cc/cppdoc/issues/new?title=${encodeURIComponent(cpprefUrl)}&labels=migrate-cppref-page`;
  return { cpprefUrl, cppdocUrl, issueUrl };
}

function generateMarkdown(status: EntryStatus): string {
  const { entry, migrated, cpprefUrl, cppdocUrl, issueUrl } = status;
  if (migrated) {
    return `| ✅ | [cppref](${cpprefUrl}) | [cppdoc](${cppdocUrl}) | \`${entry.cppdoc ?? entry.cppref + "(cppref)"}\` | `;
  } else {
    return `| ❌ | [cppref](${cpprefUrl}) | ${
      entry.cppdoc ? `[create](${issueUrl})` : "N/A"
    } |  \`${entry.cppdoc ?? entry.cppref + "(cppref)"}\` |`;
  }
}

interface SlugMapItem {
  cppref: string;
  cppdoc: string | null;
}

async function loadEntries(): Promise<SlugMapItem[]> {
  const indexPath = path.join(__dirname, "slug_map.json");
  const content = await fs.readFile(indexPath, "utf-8");
  const entries = JSON.parse(content) as SlugMapItem[];
  return entries;
}

async function main() {
  console.log("Loading entries from cppref_index.json...");
  const entries = await loadEntries();
  console.log(`Total entries: ${entries.length}`);

  const statuses: EntryStatus[] = [];
  for (const entry of entries) {
    const migrated = entry.cppdoc ? await isMigrated(entry.cppdoc) : false;
    const urls = generateUrls(entry);
    statuses.push({ entry, migrated, ...urls });
    if (statuses.length % 100 === 0) {
      console.log(`Processed ${statuses.length} entries...`);
    }
  }

  const migratedCount = statuses.filter((s) => s.migrated).length;
  const markdownLines = statuses.map(generateMarkdown);
  const output = `### cppreference.com Migration Progress
#### Overall Progress: ${migratedCount} / ${statuses.length} migrated (${((migratedCount / statuses.length) * 100).toFixed(2)}%)
Updated at ${new Date().toISOString()}

| Status | Cppref Link | Cppdoc Link | Entry |
|--------|-------------|-------------|-------|
${markdownLines.join("\n")}`;

  const outputPath = path.join(REPO_ROOT, "CPPREF_MIGRATE_PROGRESS.md");
  await fs.writeFile(outputPath, output, "utf-8");
  console.log(`Written to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
