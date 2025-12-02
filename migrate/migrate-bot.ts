import { Octokit } from "@octokit/rest";
import { JSDOM } from "jsdom";
import fs, { readFile } from "fs/promises";
import path, { join } from "path";
import { fileURLToPath } from "url";
import { execSync, spawnSync } from "child_process";
import { visualizeTextDiff } from "./text-diff-visualizer";
import { getTextFromDOM } from "./text-from-element";

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
  const dom = new JSDOM(html);
  const contentElement = dom.window.document.querySelector("#mw-content-text");

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
  const headingElement = dom.window.document.querySelector("#firstHeading");
  if (!contentElement) {
    throw new Error("Could not find #mw-content-text");
  }
  return {
    html: contentElement.innerHTML,
    title: headingElement?.textContent?.trim() || "",
    url,
    innerText: getTextFromDOM(contentElement),
  };
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
    throw new Error("生成的内容中包含过多原生HTML元素，可能转换失败。");
  }

  return content;
}

// https://cppreference.com/w/cpp/comments  => src/content/docs/cpp/comments.mdx
function getRelativeMDXPath(url: string): string {
  const match = url.match(/https?:\/\/.*?cppreference\.com\/w\/(.+)\.html$/);
  if (!match) {
    throw new Error(`无法从URL解析路径: ${url}`);
  }
  const relative = match[1]; // "cpp/comments"
  return `src/content/docs/${relative}.mdx`;
}

function getRelativeHTMLPath(url: string): string {
  const match = url.match(/https?:\/\/.*?cppreference\.com\/w\/(.+)\.html$/);
  if (!match) {
    throw new Error(`无法从URL解析路径: ${url}`);
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
  title: string
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const frontmatter = `---
title: ${JSON.stringify(title)}
description: Auto‑generated from cppreference
---\n\n`;
  await fs.writeFile(filePath, frontmatter + content, "utf8");
  console.log(`写入 ${filePath}`);
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
      const dom = new JSDOM(data);
      const contentElement = dom.window.document.querySelector("main");
      const selectorsToRemove = [".sl-anchor-link"];
      for (const selector of selectorsToRemove) {
        const elements = contentElement?.querySelectorAll(selector);
        elements?.forEach((el) => el.remove());
      }

      if (!contentElement) return "";
      return getTextFromDOM(contentElement);
    })
    .catch(() => "");

  let imageUrl = null;
  if (originalInnerText && newInnerText) {
    const webp = visualizeTextDiff(originalInnerText, newInnerText);
    if (webp) {
      imageUrl = await uploadImageToImgBB(webp);
      console.log(`上传文本差异图像到 ImgBB: ${imageUrl}`);
    }
  }

  const prBody = `> 由 ${MODEL_NAME} 自 ${url} 自动迁移
>
> 📝 [编辑此页面](${getRelativeMDXPath(url)})

<small>Close #${issue.number}</small>

${imageUrl ? `![Text Diff](${imageUrl})` : "（无文本差异图像）"}
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
      "Git操作失败:",
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
  });

  console.log(`创建PR #${pr.number}`);
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
      body: `迁移失败: ${message}\n\n已关闭issue。`,
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
      body: `迁移完成！已创建PR [#${prNumber}].`,
    });
  }
}

async function main() {
  console.log("获取带有标签", LABEL, "的issue...");
  const { data: issues } = await octokit.issues.listForRepo({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    labels: LABEL,
    state: "open",
    per_page: 50,
  });

  console.log(`找到 ${issues.length} 个issue`);

  for (const issue of issues) {
    console.log(`处理issue #${issue.number}: ${issue.title}`);
    try {
      if (hasPRReference(issue.title)) {
        continue;
      }

      const url = extractLink(issue.title);
      if (!url) {
        throw new Error("标题中未找到有效的cppreference链接");
      }

      console.log(`  获取 ${url}`);
      const { html, title, innerText } = await retry(
        () => fetchPageContent(url),
        3,
        2000
      );

      console.log(`  转换HTML为MDX...`);
      const mdx = await retry(() => convertToMDX(html, title, url), 3, 2000);

      const filePath = getLocalMDXPath(url);
      console.log(`  写入 ${filePath}`);
      await writeMDXFile(filePath, mdx, title);

      console.log(`  重新格式化...`);
      spawnSync(`npm`, ["run", "format"], {
        stdio: "inherit",
        shell: true,
      });

      console.log(`  构建...`);
      const res = spawnSync(`npm`, ["run", "build"], {
        stdio: "inherit",
        shell: true,
      });
      if (res.status !== 0) {
        throw new Error(
          "构建失败，可能生成的MDX有问题：" +
          res.stderr?.toString() +
          res.stdout?.toString() +
          res.error?.toString() +
          " exit code " +
          res.status
        );
      }

      console.log(`  创建PR...`);
      const prNumber = await createPullRequest(issue, filePath, url, innerText);

      console.log(`  更新issue...`);
      await updateIssue(issue, prNumber);

      console.log(`  issue #${issue.number} 完成`);
    } catch (error) {
      console.error(`  issue #${issue.number} 出错:`, error);
      await updateIssue(issue, null, error);
    }
  }

  console.log("全部完成");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
