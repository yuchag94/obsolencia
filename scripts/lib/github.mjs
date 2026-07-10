export async function listRepos(octokit, target) {
  if (target.type === "org") {
    return octokit.paginate("GET /orgs/{org}/repos", {
      org: target.owner,
      per_page: 100,
      type: "all",
    });
  }
  // type "user": repos propios de la cuenta autenticada (incluye privados)
  return octokit.paginate("GET /user/repos", {
    per_page: 100,
    affiliation: "owner",
    visibility: "all",
  });
}

export async function getLanguages(octokit, owner, repo) {
  try {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/languages", {
      owner,
      repo,
    });
    return data;
  } catch {
    return {};
  }
}

export async function getFileContent(octokit, owner, repo, filePath) {
  try {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: filePath,
    });
    if (Array.isArray(data) || !data.content) return null;
    return Buffer.from(data.content, data.encoding ?? "base64").toString("utf8");
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function listRootFiles(octokit, owner, repo) {
  try {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: "",
    });
    return Array.isArray(data) ? data.map((f) => f.name) : [];
  } catch {
    return [];
  }
}
