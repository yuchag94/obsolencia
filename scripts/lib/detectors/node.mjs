import { getFileContent } from "../github.mjs";

function cleanRange(range) {
  const match = String(range).match(/(\d+)(\.\d+)?(\.\d+)?/);
  return match ? match[0] : String(range);
}

export async function detectNode(octokit, owner, repo) {
  const pkgRaw = await getFileContent(octokit, owner, repo, "package.json");
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw);
      const engineNode = pkg.engines?.node;
      if (engineNode) {
        return { version: cleanRange(engineNode), source: "package.json engines.node" };
      }
    } catch {
      // package.json inválido, seguimos con el siguiente candidato
    }
  }

  const nvmrc = await getFileContent(octokit, owner, repo, ".nvmrc");
  if (nvmrc) {
    return { version: nvmrc.trim().replace(/^v/i, ""), source: ".nvmrc" };
  }

  return null;
}
