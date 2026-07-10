import { getFileContent, listRootFiles } from "../github.mjs";

export async function detectDotnet(octokit, owner, repo) {
  const files = await listRootFiles(octokit, owner, repo);
  const csproj = files.find((name) => name.toLowerCase().endsWith(".csproj"));
  if (!csproj) return null;

  const content = await getFileContent(octokit, owner, repo, csproj);
  if (!content) return null;

  const match = content.match(/<TargetFrameworks?>([^<]+)<\/TargetFrameworks?>/);
  if (!match) return null;

  const first = match[1].split(";")[0].trim();
  const version = first.replace(/^net/i, "");
  return { version, source: csproj };
}
