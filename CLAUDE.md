# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A dependency/language-obsolescence dashboard for GitHub repositories. A
scheduled GitHub Actions job scans one or more GitHub accounts/orgs
(configured in `config.yml`), writes a JSON report, and a static page
(GitHub Pages, served from `docs/`) renders it as a filterable table:
repo name, language, detected language version, EOL/support status, and
open dependency vulnerabilities. No backend server — everything runs as a
scheduled Action plus a static site that fetches a JSON file.

See [README.md](README.md) for end-user setup instructions (token scopes,
enabling Pages, config format). This file is about the code itself.

## Commands

All scanner commands run from `scripts/`:

```bash
cd scripts
npm install
SCAN_TOKEN=ghp_xxx npm run scan   # runs scan.mjs, writes ../docs/data/report.json
```

`SCAN_TOKEN` (or `GITHUB_TOKEN`) must be a GitHub PAT with repo read +
`security_events` read scope (see README for exact scopes). Without it,
`scan.mjs` exits immediately with an error.

To preview the frontend locally against a real or hand-edited
`docs/data/report.json`, serve `docs/` with any static file server (e.g.
`npx serve docs`) — opening `docs/index.html` directly via `file://` breaks
the `fetch("data/report.json")` call in `docs/app.js` due to CORS, so it
must be served over HTTP.

There is no test suite, lint config, or build step in this repo. `node
--check <file>.mjs` is sufficient to catch syntax errors when editing the
scanner. The frontend is plain HTML/CSS/JS with no bundler.

## Architecture

### Scan pipeline (`scripts/scan.mjs`)

`scan.mjs` is the orchestrator, run either locally or by
`.github/workflows/scan.yml` (cron: Fridays 06:00 UTC, plus manual
`workflow_dispatch`). Flow:

1. Load `config.yml` — a list of `targets` (`{owner, type: user|org}`) plus
   `excludeArchived`, `excludeForks`, `eolNearThresholdDays`.
2. For each target, list repos via `lib/github.mjs` (`listRepos`) — `type:
   "user"` uses `GET /user/repos` (the *token's own* account, including
   private repos); `type: "org"` uses `GET /orgs/{org}/repos`.
3. For each repo (bounded concurrency, `CONCURRENCY = 8` via the
   hand-rolled `mapWithConcurrency` worker pool — no external dep):
   - Fetch primary language via GitHub's `languages` endpoint.
   - Look up that language in the `DETECTORS` map (`scan.mjs`) to get a
     version detector function and an `eolKey` (the product slug used by
     endoflife.date).
   - Run the detector to extract a declared version from a manifest file
     (see "Version detectors" below).
   - Resolve EOL/support status for that version via `lib/eol.mjs`
     (queries `endoflife.date`, cached per product for the run).
   - Resolve the recommended version to migrate to, also via `lib/eol.mjs`
     (`getRecommendedVersion`), reusing the same per-product cache.
   - Fetch open Dependabot alerts via `lib/dependabot.mjs`, tallied by
     severity.
4. Write the merged result as `docs/data/report.json` (sorted by
   `fullName`). The Actions workflow commits this file back to `main`.

**Incremental optimization**: `scan.mjs` loads the *previous*
`docs/data/report.json` before scanning and, per repo, skips re-running the
version detector (the only step that reads file contents) if
`repo.pushed_at` is unchanged since the last recorded scan — reusing the
previously detected version instead. Language listing and vulnerability
checks always re-run, since Dependabot alerts can change independent of
pushes. This matters because a single org scan can cover hundreds of repos
against GitHub's rate limits.

### Version detectors (`scripts/lib/detectors/`)

One file per supported language (`node.mjs`, `python.mjs`, `java.mjs`,
`go.mjs`, `dotnet.mjs`), each exporting a `detect(octokit, owner, repo)`
that returns `{ version, source }` or `null`. They fetch specific manifest
files via `getFileContent`/`listRootFiles` (`lib/github.mjs`) and extract a
version with a targeted regex — there's no JSON/TOML/XML parser dependency
by design; each detector only needs one or two fields out of files it
already knows the shape of (`package.json` engines.node, `.nvmrc`,
`pyproject.toml`, `runtime.txt`, `pom.xml`, `build.gradle`, `go.mod`,
`*.csproj`). If you add a new language, add a detector here and wire it
into the `DETECTORS` map in `scan.mjs` with the matching endoflife.date
product slug (check the exact slug at endoflife.date's API before wiring
it up — slugs don't always match the obvious name, e.g. Node.js is
`nodejs` not `node`).

### `lib/eol.mjs`

Wraps the public `https://endoflife.date/api/{product}.json` endpoint (no
auth). `resolveEol(productKey, rawVersion, nearThresholdDays)` normalizes
the detected version and tries matching it against the product's `cycle`
values at three granularities (full version, `major.minor`, `major`), then
classifies as `eol` / `near-eol` / `supported` / `unknown` based on the
`eol` date vs. `nearThresholdDays`. Results are cached per product for the
life of the process.

`getRecommendedVersion(productKey)` picks the version to recommend
upgrading to. endoflife.date returns cycles newest-first, so it filters to
currently-supported cycles and takes the first one — unless the product
tags cycles as LTS (`lts` field), in which case it prefers the newest cycle
that is *currently* LTS. Note `lts` on some products (Node.js, .NET) is not
a boolean but the date a cycle *becomes* LTS — a future date means "not LTS
yet," so the currently-LTS check compares that date against `Date.now()`
rather than just checking truthiness. Getting this wrong silently
recommends an unstable "current" release instead of the safe LTS one.

### `lib/dependabot.mjs`

Wraps `GET /repos/{owner}/{repo}/dependabot/alerts?state=open`, tallying by
`security_advisory.severity`. Treats 400/403/404 as "Dependabot not
enabled on this repo" (`available: false`) rather than a hard failure,
since scanning across many repos in an org will hit repos without
Dependabot alerts turned on.

### Frontend (`docs/`)

Static, no build step, no framework. `docs/app.js` fetches
`docs/data/report.json` on load, populates the language/owner filter
dropdowns from the data, and re-renders the table on every
search/filter/sort change (client-side only, full re-render — the row
counts this tool targets, hundreds not thousands, don't need
virtualization). `docs/styles.css` uses CSS custom properties with a
`prefers-color-scheme: dark` override block; keep new UI additions themed
through those variables rather than hardcoded colors.

### Report schema (`docs/data/report.json`)

```
{ generatedAt, targets, repos: [{
    owner, ownerType, repo, fullName, url,
    language, languageVersion, versionSource,
    eol: { status, eolDate, cycle },
    recommended: { version, cycle, eolDate } | null,
    vulnerabilities: { available, critical, high, medium, low, total },
    archived, fork, pushedAt, lastScanned
}]}
```

`scan.mjs` and `docs/app.js` are the only two consumers/producers of this
shape — if you change one, update the other.
