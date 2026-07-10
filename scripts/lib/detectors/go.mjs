import { getFileContent } from "../github.mjs";

export async function detectGo(octokit, owner, repo) {
  const gomod = await getFileContent(octokit, owner, repo, "go.mod");
  if (gomod) {
    const match = gomod.match(/^go\s+(\d+\.\d+(?:\.\d+)?)/m);
    if (match) return { version: match[1], source: "go.mod" };
  }
  return null;
}
