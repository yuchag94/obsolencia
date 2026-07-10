const EMPTY = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

export async function getVulnerabilities(octokit, owner, repo) {
  try {
    const alerts = await octokit.paginate("GET /repos/{owner}/{repo}/dependabot/alerts", {
      owner,
      repo,
      state: "open",
      per_page: 100,
    });

    const tally = { available: true, ...EMPTY };
    for (const alert of alerts) {
      const severity = alert.security_advisory?.severity ?? "low";
      if (severity in EMPTY) tally[severity]++;
      tally.total++;
    }
    return tally;
  } catch (err) {
    // Dependabot alerts deshabilitado, sin permisos, o repo sin dependency graph
    if (err.status === 403 || err.status === 404 || err.status === 400) {
      return { available: false, ...EMPTY };
    }
    throw err;
  }
}
