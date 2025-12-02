#!/usr/bin/env node

import { Octokit } from "@octokit/rest";
import { JSDOM } from "jsdom";
import fs, { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const REPO_OWNER = process.env.GITHUB_REPOSITORY_OWNER || "owner";
const REPO_NAME = process.env.GITHUB_REPOSITORY?.split("/")[1] || "cppdoc";
const LABEL = "migrate-cppref-page";

if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN");
  process.exit(1);
}
if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY");
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

function retry(fn, retries = 3, delay = 1000) {
  return fn().catch((err) => {
    if (retries > 0) {
      console.log(`Retrying... (${retries} retries left)`, err.message, err.stack);
      return new Promise((resolve) =>
        setTimeout(() => resolve(retry(fn, retries - 1, delay)), delay),
      );
    } else {
      return Promise.reject(err);
    }
  });
}

function extractLink(title) {
  const urlRegex = /https?:\/\/en\.cppreference\.com\/w\/[^\s]+/g;
  const match = title.match(urlRegex);
  return match ? match[0] : null;
}

function hasPRReference(title) {
  return /\[#\d+\]/.test(title);
}

async function fetchPageContent(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const html = await response.text();
  const dom = new JSDOM(html);
  const contentElement = dom.window.document.querySelector("#mw-content-text");
  const headingElement = dom.window.document.querySelector("#firstHeading");
  if (!contentElement) {
    throw new Error("Could not find #mw-content-text");
  }
  return {
    html: contentElement.innerHTML,
    title: headingElement?.textContent?.trim() || "",
    url,
  };
}

async function convertToMDX(html, title, url) {
  const prompt = (await readFile(__dirname + "/PROMPT.md", "utf8")).replace(
    "{{LLM_DOCS}}",
    await readFile(
      __dirname +
      "/../src/content/docs/development/guide/component-docs-for-llm.mdx",
      "utf8",
    ),
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
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: `
// Convert the following HTML content from cppreference.com into MDX format suitable for CppDoc.
// Title: ${title}
// URL: ${url}
// HTML Content:
${html}
`,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = await response.json();
  let content = data.choices[0].message.content.trim();

  console.log("Raw content:", content);

  if (content.includes("```mdx")) {
    content = content.slice(content.indexOf("```mdx") + 6, content.lastIndexOf("```")).trim();
  }

  // Auto Import
  const components = [
    'Behavior',
    'Decl',
    'DeclDoc',
    'DescList',
    'Desc',
    'ParamDocList',
    'ParamDoc',
    'DocLink',
    'CHeader',
    'CppHeader',
    'FeatureTestMacro',
    'FeatureTestMacroValue',
    'DR',
    'DRList',
    'Revision',
    'RevisionBlock',
    'AutoCollapse',
    'FlexTable',
    'WG21PaperLink',
  ]

  const usedComponents = components.filter((comp) => content.includes(`<${comp} `) || content.includes(`<${comp}>`));

  // Remove all existing import statements
  content = content.split('\n').filter(line => !line.startsWith('import ')).join('\n');

  // Sort used components alphabetically
  usedComponents.sort();

  if (usedComponents.length > 0) {
    const importStatements = `import { ${usedComponents.join(', ')} } from '@/components/index.ts';\n\n`;
    content = importStatements + content;
  }

  // Verify content
  let normalElements = ["<div", "<section", "<span", "<table", "<thead", "<tbody", "<tr", "<td", "<th"], normalElementsCount = 0;
  for (const elem of normalElements) {
    normalElementsCount += (content.match(new RegExp(elem, 'g')) || []).length;
  }

  console.log(`Normal HTML elements count: ${normalElementsCount}`);

  if (normalElementsCount > 4) {
    throw new Error("生成的内容中包含过多原生HTML元素，可能转换失败。");
  }

  return content;
}

function getLocalPath(url) {
  // https://en.cppreference.com/w/cpp/comments.html -> src/content/docs/cpp/comments.mdx
  const match = url.match(/https?:\/\/en\.cppreference\.com\/w\/(.+)\.html$/);
  if (!match) {
    throw new Error(`无法从URL解析路径: ${url}`);
  }
  const relative = match[1]; // "cpp/comments"
  return path.join(
    __dirname,
    "..",
    "src",
    "content",
    "docs",
    `${relative}.mdx`,
  );
}

async function writeMDXFile(filePath, content, title) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const frontmatter = `---
title: ${title}
description: Auto‑generated from cppreference
---\n\n`;
  await fs.writeFile(filePath, frontmatter + content, "utf8");
  console.log(`写入 ${filePath}`);
}

async function createPullRequest(issue, filePath, url) {
  const branchName = `migrate/${issue.number}-${Date.now().toString(36)}`;
  const commitMessage = `Migrate ${url}`;
  const prTitle = `[#${issue.number}] Migrate ${url}`;
  const prBody = `自动迁移自 ${url}\n\nclose #${issue.number}`;

  const { execSync } = await import("child_process");
  try {
    execSync(`git config user.name "github-actions[bot]"`);
    execSync(
      `git config user.email "github-actions[bot]@users.noreply.github.com"`,
    );
    execSync(`git checkout -b ${branchName}`);
    execSync(`git add "${filePath}"`);
    execSync(`git commit -m "${commitMessage}"`);
    execSync(`git push origin ${branchName}`);
  } catch (error) {
    console.error("Git操作失败:", error.message);
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

async function updateIssue(issue, prNumber, error = null) {
  const newTitle = `[#${prNumber}] ${issue.title.replace(/\[#\d+\]\s*/, "")}`;
  await octokit.issues.update({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    issue_number: issue.number,
    title: newTitle,
  });

  if (error) {
    await octokit.issues.createComment({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      issue_number: issue.number,
      body: `迁移失败: ${error.message}\n\n已关闭issue。`,
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
      const { html, title } = await retry(() => fetchPageContent(url), 3, 2000);

      console.log(`  转换HTML为MDX...`);
      const mdx = await retry(() => convertToMDX(html, title, url), 3, 2000);

      const filePath = getLocalPath(url);
      console.log(`  写入 ${filePath}`);
      await writeMDXFile(filePath, mdx, title);

      console.log(`  创建PR...`);
      const prNumber = await createPullRequest(issue, filePath, url);

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
