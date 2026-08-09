import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", "coverage", "dist", "node_modules"]);
const requiredDocuments = [
  "AGENTS.md",
  "README.md",
  "docs/ARCHITECTURE.md",
  "docs/CURRENT_STATE.md",
  "docs/MERGE_POLICY.md",
  "docs/PERMISSIONS.md",
  "docs/PRODUCT.md",
  "docs/ROADMAP.md",
  "docs/SECURITY.md",
  "docs/adr/README.md",
];

const errors = [];

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

function validateDocumentStructure(file, content) {
  const repositoryPath = relative(repositoryRoot, file);
  const lines = content.split("\n");

  for (const [index, line] of lines.entries()) {
    if (/[\t ]+$/.test(line)) {
      errors.push(`${repositoryPath}:${index + 1} has trailing whitespace`);
    }
  }

  if (!repositoryPath.startsWith(".github/")) {
    const topLevelHeadings = lines.filter((line) => line.startsWith("# ")).length;
    if (topLevelHeadings !== 1) {
      errors.push(`${repositoryPath} must contain exactly one top-level heading`);
    }
  }

  const codeFences = lines.filter((line) => line.startsWith("```")).length;
  if (codeFences % 2 !== 0) {
    errors.push(`${repositoryPath} has unbalanced fenced code blocks`);
  }
}

async function validateRelativeLinks(file, content) {
  const repositoryPath = relative(repositoryRoot, file);
  const markdownLink = /\[[^\]]+\]\(([^)]+)\)/g;

  for (const match of content.matchAll(markdownLink)) {
    let target = match[1];
    if (!target || /^(?:[a-z]+:|#)/i.test(target)) {
      continue;
    }

    target = target.replace(/^<|>$/g, "").split("#", 1)[0];
    if (!target) {
      continue;
    }

    const decodedTarget = decodeURIComponent(target);
    const targetPath = resolve(dirname(file), decodedTarget);
    if (!(await pathExists(targetPath))) {
      errors.push(`${repositoryPath} links to missing path ${target}`);
    }
  }
}

async function validateRuleset() {
  const rulesetPath = join(repositoryRoot, ".github/rulesets/protect-main.json");
  const ruleset = JSON.parse(await readFile(rulesetPath, "utf8"));
  const ruleByType = new Map(ruleset.rules?.map((rule) => [rule.type, rule]));
  const pullRequest = ruleByType.get("pull_request")?.parameters;

  if (ruleset.name !== "Protect main" || ruleset.enforcement !== "active") {
    errors.push("Protect main ruleset must remain active in desired state");
  }
  if (!ruleByType.has("deletion") || !ruleByType.has("non_fast_forward")) {
    errors.push("Protect main ruleset must block deletion and force updates");
  }
  if (
    pullRequest?.required_approving_review_count !== 0 ||
    pullRequest?.required_review_thread_resolution !== true ||
    pullRequest?.allowed_merge_methods?.join(",") !== "squash"
  ) {
    errors.push("Protect main pull-request controls differ from the accepted baseline");
  }
}

for (const document of requiredDocuments) {
  if (!(await pathExists(join(repositoryRoot, document)))) {
    errors.push(`Required document is missing: ${document}`);
  }
}

const markdownFiles = await collectMarkdownFiles(repositoryRoot);
for (const file of markdownFiles) {
  const content = await readFile(file, "utf8");
  validateDocumentStructure(file, content);
  await validateRelativeLinks(file, content);
}

await validateRuleset();

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Repository validation passed (${markdownFiles.length} Markdown files).`);
}
