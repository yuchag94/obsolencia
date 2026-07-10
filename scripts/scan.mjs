import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Octokit } from "@octokit/rest";
import yaml from "js-yaml";

import { listRepos, getLanguages } from "./lib/github.mjs";
import { getVulnerabilities } from "./lib/dependabot.mjs";
import { resolveEol, getRecommendedVersion } from "./lib/eol.mjs";
import { detectNode } from "./lib/detectors/node.mjs";
import { detectPython } from "./lib/detectors/python.mjs";
import { detectJava } from "./lib/detectors/java.mjs";
import { detectGo } from "./lib/detectors/go.mjs";
import { detectDotnet } from "./lib/detectors/dotnet.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "config.yml");
const OUTPUT_PATH = path.join(ROOT, "docs", "data", "report.json");
const CONCURRENCY = 8;

// Mapea el lenguaje principal reportado por GitHub a un detector de versión
// y al slug del producto correspondiente en endoflife.date
const DETECTORS = {
  JavaScript: { eolKey: "nodejs", detect: detectNode },
  TypeScript: { eolKey: "nodejs", detect: detectNode },
  Python: { eolKey: "python", detect: detectPython },
  Java: { eolKey: "java", detect: detectJava },
  Go: { eolKey: "go", detect: detectGo },
  "C#": { eolKey: "dotnet", detect: detectDotnet },
};

function loadConfig() {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  const config = yaml.load(raw) ?? {};
  if (!Array.isArray(config.targets) || config.targets.length === 0) {
    throw new Error("config.yml debe definir al menos un target en 'targets'.");
  }
  return config;
}

function loadPreviousReport() {
  if (!existsSync(OUTPUT_PATH)) return new Map();
  try {
    const previous = JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
    return new Map((previous.repos ?? []).map((r) => [r.fullName, r]));
  } catch {
    return new Map();
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function scanRepo(octokit, target, repo, nearThresholdDays, previousByFullName) {
  const fullName = repo.full_name;
  const previous = previousByFullName.get(fullName);
  const unchanged = previous && previous.pushedAt === repo.pushed_at;

  const languages = await getLanguages(octokit, target.owner, repo.name);
  const primaryLanguage =
    Object.keys(languages).sort((a, b) => languages[b] - languages[a])[0] ?? null;
  const detectorEntry = primaryLanguage ? DETECTORS[primaryLanguage] : null;

  let versionInfo = null;
  if (detectorEntry) {
    if (unchanged && previous.languageVersion) {
      versionInfo = { version: previous.languageVersion, source: previous.versionSource };
    } else {
      versionInfo = await detectorEntry.detect(octokit, target.owner, repo.name);
    }
  }

  const eol = detectorEntry
    ? await resolveEol(detectorEntry.eolKey, versionInfo?.version ?? null, nearThresholdDays)
    : { status: "unknown", eolDate: null, cycle: null };

  const recommended = detectorEntry
    ? await getRecommendedVersion(detectorEntry.eolKey)
    : null;

  const vulnerabilities = await getVulnerabilities(octokit, target.owner, repo.name);

  return {
    owner: target.owner,
    ownerType: target.type,
    repo: repo.name,
    fullName,
    url: repo.html_url,
    language: primaryLanguage,
    languageVersion: versionInfo?.version ?? null,
    versionSource: versionInfo?.source ?? null,
    eol,
    recommended,
    vulnerabilities,
    archived: repo.archived,
    fork: repo.fork,
    pushedAt: repo.pushed_at,
    lastScanned: new Date().toISOString(),
  };
}

async function main() {
  const token = process.env.SCAN_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("Falta el token de GitHub. Define SCAN_TOKEN (o GITHUB_TOKEN) en el entorno.");
    process.exit(1);
  }

  const config = loadConfig();
  const nearThresholdDays = config.eolNearThresholdDays ?? 180;
  const octokit = new Octokit({ auth: token });
  const previousByFullName = loadPreviousReport();

  const candidates = [];
  for (const target of config.targets) {
    const repos = await listRepos(octokit, target);
    for (const repo of repos) {
      if (config.excludeArchived && repo.archived) continue;
      if (config.excludeForks && repo.fork) continue;
      candidates.push({ target, repo });
    }
  }

  console.log(`Escaneando ${candidates.length} repositorios...`);

  const scanned = await mapWithConcurrency(candidates, CONCURRENCY, ({ target, repo }) =>
    scanRepo(octokit, target, repo, nearThresholdDays, previousByFullName)
  );

  const report = {
    generatedAt: new Date().toISOString(),
    targets: config.targets,
    repos: scanned.sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
  console.log(`Reporte generado con ${scanned.length} repositorios en ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
