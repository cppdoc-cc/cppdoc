import { Octokit } from "@octokit/rest";
import { execSync } from "child_process";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPOSITORY_OWNER || "owner";
const REPO_NAME = process.env.GITHUB_REPOSITORY?.split("/")[1] || "cppdoc";

if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN");
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function getAllOpenPRs() {
  const prs = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await octokit.pulls.list({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      state: "open",
      per_page: perPage,
      page,
    });
    if (data.length === 0) break;
    prs.push(...data);
    if (data.length < perPage) break;
    page++;
  }

  console.log(`Found ${prs.length} open PRs`);
  return prs;
}

async function getAllBranches() {
  const branches = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await octokit.repos.listBranches({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      per_page: perPage,
      page,
    });
    if (data.length === 0) break;
    branches.push(...data);
    if (data.length < perPage) break;
    page++;
  }

  console.log(`Found ${branches.length} branches`);
  return branches;
}

function filterMigrateBranches(branches: { name: string }[]) {
  return branches.filter((b) => b.name.startsWith("migrate/"));
}

async function deleteBranch(branchName: string) {
  try {
    await octokit.git.deleteRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${branchName}`,
    });
    console.log(`Deleted remote branch ${branchName}`);
  } catch (error) {
    console.error(`Failed to delete branch ${branchName}:`, error);
  }
}

async function main() {
  console.log("Starting cleanup of migrate branches without open PRs...");

  const [prs, branches] = await Promise.all([
    getAllOpenPRs(),
    getAllBranches(),
  ]);

  const prBranchNames = new Set(prs.map((pr) => pr.head.ref));
  console.log("PR branches:", Array.from(prBranchNames));

  const migrateBranches = filterMigrateBranches(branches);
  console.log(
    "Migrate branches:",
    migrateBranches.map((b) => b.name)
  );

  const toDelete = migrateBranches.filter((b) => !prBranchNames.has(b.name));
  console.log(`Found ${toDelete.length} branches to delete:`);
  toDelete.forEach((b) => console.log(` - ${b.name}`));

  if (toDelete.length === 0) {
    console.log("No branches to delete.");
    return;
  }

  for (const branch of toDelete) {
    await deleteBranch(branch.name);
  }

  console.log("Cleanup completed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
