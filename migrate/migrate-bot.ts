import { Octokit } from "@octokit/rest";
import { parseHTML } from "linkedom";
import fs, { readFile } from "fs/promises";
import path, { join } from "path";
import { fileURLToPath } from "url";
import { execSync, spawnSync } from "child_process";
import { visualizeTextDiff } from "./text-diff-visualizer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || "";
const REPO_OWNER = process.env.GITHUB_REPOSITORY_OWNER || "owner";
const REPO_NAME = process.env.GITHUB_REPOSITORY?.split("/")[1] || "cppdoc";
const LABEL = "migrate-cppref-page";
const MODEL_NAME = "google/gemini-2.5-flash";

if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN");
  process.exit(1);
}
if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY");
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

let slugMapCache: Map<string, string | null> | null = null;

async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(
        `Attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`
      );
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}

function extractLink(title: string): string | null {
  const urlRegex = /https?:\/\/.*?cppreference\.com\/w\/[^\s]+/g;
  const match = title.match(urlRegex);
  return match ? match[0] : null;
}

function hasPRReference(title: string): boolean {
  return /\[#\d+\]/.test(title);
}

async function fetchPageContent(
  url: string
): Promise<{ html: string; title: string; url: string; innerText: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const html = await response.text();
  const document = parseHTML(html).document;
  const contentElement = document.querySelector("#mw-content-text");

  const selectorsToRemove = [
    ".t-navbar",
    ".t-example-live-link",
    ".editsection",
    "#toc",
  ];
  for (const selector of selectorsToRemove) {
    const elements = contentElement?.querySelectorAll(selector);
    elements?.forEach((el) => el.remove());
  }
  const headingElement = document.querySelector("#firstHeading");
  if (!contentElement) {
    throw new Error("Could not find #mw-content-text");
  }

  const title = headingElement?.textContent?.trim() || "";

  return {
    html: contentElement.innerHTML,
    title,
    url,
    innerText: title + "\n" + (contentElement as HTMLDivElement).innerText,
  };
}

async function loadSlugMap(): Promise<Map<string, string | null>> {
  const mapPath = path.join(__dirname, "slug_map.json");
  const data = await readFile(mapPath, "utf8");
  const arr = JSON.parse(data) as Array<{
    cppref: string;
    cppdoc: string | null;
  }>;
  const map = new Map<string, string | null>();
  for (const entry of arr) {
    map.set(entry.cppref, entry.cppdoc);
  }
  return map;
}

function replaceDocLinks(
  content: string,
  slugMap: Map<string, string | null>
): string {
  const docLinkRegex = /<DocLink\s+([^>]*)>/g;
  return content.replace(docLinkRegex, (match, attributes) => {
    const srcMatch = attributes.match(/src\s*=\s*["']([^"']+)["']/);
    if (!srcMatch) {
      return match;
    }
    const src = srcMatch[1];
    if (!src.startsWith("/")) {
      return match;
    }
    const key = src.slice(1).replace(/\.html$/, "");
    const mapped = slugMap.get(key);
    let newSrc: string;
    if (mapped === undefined) {
      return match;
    } else if (mapped === null) {
      newSrc = `/not-migrated-url#${src}`;
    } else {
      newSrc = `/${mapped}`;
    }
    const newAttributes = attributes.replace(srcMatch[0], `src="${newSrc}"`);
    return `<DocLink ${newAttributes}>`;
  });
}

async function convertToMDX(
  html: string,
  title: string,
  url: string
): Promise<string> {
  const prompt = (await readFile(__dirname + "/PROMPT.md", "utf8")).replace(
    "{{LLM_DOCS}}",
    await readFile(
      __dirname +
        "/../src/content/docs/development/guide/component-docs-for-llm.mdx",
      "utf8"
    )
  );

  console.log("Prompt:", prompt);

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/cppdoc/cppdoc",
        "X-Title": "CppDoc Migration Bot",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: "user", content: prompt },
          {
            role: "user",
            content: `
// URL: ${url}
// HTML Content:
${html}

// Converted MDX Content without using html tags, only using CppDoc components and markdown syntax:
`,
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  let content = data.choices[0].message.content.trim();

  console.log("Raw content:", content);

  if (content.includes("```mdx")) {
    content = content
      .slice(content.indexOf("```mdx") + 6, content.lastIndexOf("```"))
      .trim();
  }

  // Auto Import
  const components = [
    "Behavior",
    "Decl",
    "DeclDoc",
    "DescList",
    "Desc",
    "ParamDocList",
    "ParamDoc",
    "DocLink",
    "CHeader",
    "CppHeader",
    "FeatureTestMacro",
    "FeatureTestMacroValue",
    "DR",
    "DRList",
    "Revision",
    "RevisionBlock",
    "AutoCollapse",
    "FlexTable",
    "WG21PaperLink",
  ];

  const usedComponents = components.filter(
    (comp: string) =>
      content.includes(`<${comp} `) || content.includes(`<${comp}>`)
  );

  // Remove all existing import statements
  content = content
    .split("\n")
    .filter((line: string) => !line.startsWith("import "))
    .join("\n");

  // Sort used components alphabetically
  usedComponents.sort();

  if (usedComponents.length > 0) {
    const importStatements = `import { ${usedComponents.join(", ")} } from '@components/index';\n\n`;
    content = importStatements + content;
  }

  // Replace DocLink src attributes based on slug_map.json
  content = replaceDocLinks(content, slugMapCache!);

  // Verify content
  const normalElements = [
    "<div",
    "<section",
    "<span",
    "<table",
    "<thead",
    "<tbody",
    "<tr",
    "<td",
    "<th",
  ];
  let normalElementsCount = 0;
  for (const elem of normalElements) {
    const matches = content.match(new RegExp(elem, "g"));
    normalElementsCount += matches ? matches.length : 0;
  }

  console.log(`Normal HTML elements count: ${normalElementsCount}`);

  if (normalElementsCount > 4) {
    throw new Error(
      "The generated content contains too many native HTML elements, conversion may have failed."
    );
  }

  return content;
}

// https://cppreference.com/w/cpp/comments  => src/content/docs/cpp/comments.mdx
function getRelativeMDXPath(url: string): string {
  const match = url.match(/https?:\/\/.*?cppreference\.com\/w\/(.+)\.html$/);
  if (!match) {
    throw new Error(`Unable to parse path from URL: ${url}`);
  }
  const relative = match[1]; // "cpp/comments"
  const mapped = slugMapCache!.get(relative);
  if (mapped) {
    return `src/content/docs/${mapped}.mdx`;
  }
  throw new Error(`No mapping found for cppreference path: ${relative}`);
}

function getRelativeHTMLPath(url: string): string {
  const match = url.match(/https?:\/\/.*?cppreference\.com\/w\/(.+)\.html$/);
  if (!match) {
    throw new Error(`Unable to parse path from URL: ${url}`);
  }
  const relative = match[1]; // "cpp/comments"
  return `dist/${relative}/index.html`;
}

function getLocalMDXPath(url: string): string {
  return path.join(__dirname, "..", getRelativeMDXPath(url));
}

async function writeMDXFile(
  filePath: string,
  content: string,
  title: string,
  cpprefUrl: string
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const frontmatter = `---
title: ${JSON.stringify(title)}
cppref-url: ${cpprefUrl ? JSON.stringify(cpprefUrl) : "null"}
---\n\n`;
  await fs.writeFile(filePath, frontmatter + content, "utf8");
  console.log(`Written to ${filePath}`);
}

// curl --location --request POST "https://api.imgbb.com/1/upload?expiration=600&key=YOUR_CLIENT_API_KEY" --form "image=R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
async function uploadImageToImgBB(imageBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  formData.append(
    "image",
    new Blob([new Uint8Array(imageBuffer)]),
    "diff.webp"
  );
  formData.append("name", "diff.webp");

  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}&name=diff.webp`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ImgBB API error: ${error}`);
  }

  const data = (await response.json()) as { data: { url: string } };
  return data.data.url;
}

async function createPullRequest(
  issue: { number: number; title: string },
  filePath: string,
  url: string,
  originalInnerText: string
): Promise<number> {
  const branchName = `migrate/${issue.number}-${Date.now().toString(36)}`;
  const page = url.split("/w/").pop();
  const pageName = page ? page.replace(".html", "") : "unknown";
  const prTitle = `feat: migrate ${pageName} from cppref [#${issue.number}]`;
  const commitMessage = prTitle;

  const newInnerText = await readFile(getRelativeHTMLPath(url), "utf8")
    .then((data) => {
      const document = parseHTML(data).document;
      const contentElement = document.querySelector("main");
      const selectorsToRemove = [".sl-anchor-link"];
      for (const selector of selectorsToRemove) {
        const elements = contentElement?.querySelectorAll(selector);
        elements?.forEach((el) => el.remove());
      }

      if (!contentElement) return "";
      return (contentElement as HTMLDivElement).innerText;
    })
    .catch(() => "");

  let imageUrl = null;
  if (originalInnerText && newInnerText) {
    const webp = visualizeTextDiff(originalInnerText, newInnerText);
    if (webp) {
      imageUrl = await uploadImageToImgBB(webp);
      console.log(`Uploaded text diff image to ImgBB: ${imageUrl}`);
    }
  }

  const prBody = `> Automatically migrated from ${url} by ${MODEL_NAME}
>
> 📝 [Edit this page](https://github.com/cppdoc-cc/cppdoc/edit/${branchName}/${getRelativeMDXPath(url)})

<small>Close #${issue.number}</small>

${imageUrl ? `![Text Diff](${imageUrl})` : "(No text diff image)"}
<small>Green: word count increased after migration; Red: word count decreased after migration.</small>
`;

  const { execSync } = await import("child_process");
  try {
    execSync(`git config user.name "github-actions[bot]"`);
    execSync(
      `git config user.email "github-actions[bot]@users.noreply.github.com"`
    );
    execSync(`git checkout -b ${branchName}`);
    execSync(`git add "${filePath}"`);
    execSync(`git commit -m "${commitMessage}"`);
    execSync(`git push origin ${branchName}`);
  } catch (error) {
    console.error(
      "Git operation failed:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }

  const { data: pr } = await octokit.pulls.create({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    title: prTitle,
    body: prBody,
    head: branchName,
    base: "main",
    draft: true,
  });

  console.log(`Created PR #${pr.number}`);
  return pr.number;
}

async function updateIssue(
  issue: { number: number; title: string },
  prNumber: number | null,
  error: unknown = null
): Promise<void> {
  const newTitle = `[#${prNumber}] ${issue.title.replace(/\[#\d+\]\s*/, "")}`;
  await octokit.issues.update({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    issue_number: issue.number,
    title: newTitle,
  });

  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    await octokit.issues.createComment({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      issue_number: issue.number,
      body: `Migration failed: ${message}\n\nIssue closed.`,
    });
    await octokit.issues.update({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      issue_number: issue.number,
      state: "closed",
    });
  } else {
    await octokit.issues.createComment({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      issue_number: issue.number,
      body: `Migration completed! Created PR [#${prNumber}].`,
    });
  }
}

async function main() {
  slugMapCache = await loadSlugMap();

  console.log("Fetching issues with label", LABEL, "...");
  const { data: issues } = await octokit.issues.listForRepo({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    labels: LABEL,
    state: "open",
    per_page: 50,
  });

  console.log(`Found ${issues.length} issues`);

  for (const issue of issues) {
    console.log(`Processing issue #${issue.number}: ${issue.title}`);
    try {
      if (hasPRReference(issue.title)) {
        continue;
      }

      const url = extractLink(issue.title);
      if (!url) {
        throw new Error("No valid cppreference link found in title");
      }

      console.log(`  Fetching ${url}`);
      const { html, title, innerText } = await retry(
        () => fetchPageContent(url),
        3,
        2000
      );

      console.log(`  Converting HTML to MDX...`);
      const mdx = await retry(() => convertToMDX(html, title, url), 3, 2000);

      const filePath = getLocalMDXPath(url);
      console.log(`  Writing to ${filePath}`);
      await writeMDXFile(filePath, mdx, title, url);

      console.log(`  Re-formatting...`);
      spawnSync(`npm`, ["run", "format"], {
        stdio: "inherit",
        shell: true,
      });

      console.log(`  Building...`);
      const res = spawnSync(`npm`, ["run", "build"], {
        stdio: "inherit",
        shell: true,
      });
      if (res.status !== 0) {
        throw new Error(
          "Build failed, possibly due to issues with the generated MDX:" +
            res.stderr?.toString() +
            res.stdout?.toString() +
            res.error?.toString() +
            " exit code " +
            res.status
        );
      }

      console.log(`  Creating PR...`);
      const prNumber = await createPullRequest(issue, filePath, url, innerText);

      console.log(`  Updating issue...`);
      await updateIssue(issue, prNumber);

      console.log(`  Issue #${issue.number} completed`);
    } catch (error) {
      console.error(`  Issue #${issue.number} error:`, error);
      await updateIssue(issue, null, error);
    }
  }

  console.log("All completed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
