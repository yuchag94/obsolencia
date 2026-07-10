import { getFileContent } from "../github.mjs";

function cleanRange(range) {
  const match = String(range).match(/(\d+)(\.\d+)?(\.\d+)?/);
  return match ? match[0] : String(range);
}

export async function detectPython(octokit, owner, repo) {
  const pyproject = await getFileContent(octokit, owner, repo, "pyproject.toml");
  if (pyproject) {
    const requiresPython = pyproject.match(/requires-python\s*=\s*["']([^"']+)["']/);
    if (requiresPython) {
      return { version: cleanRange(requiresPython[1]), source: "pyproject.toml requires-python" };
    }
    const poetryPython = pyproject.match(/\bpython\s*=\s*["']([^"']+)["']/);
    if (poetryPython) {
      return { version: cleanRange(poetryPython[1]), source: "pyproject.toml [tool.poetry.dependencies] python" };
    }
  }

  const runtime = await getFileContent(octokit, owner, repo, "runtime.txt");
  if (runtime) {
    const match = runtime.match(/python-([\d.]+)/i);
    if (match) return { version: match[1], source: "runtime.txt" };
  }

  return null;
}
