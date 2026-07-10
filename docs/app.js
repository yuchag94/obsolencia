const STATUS_LABELS = {
  eol: "Vencido",
  "near-eol": "Próximo a vencer",
  supported: "Vigente",
  unknown: "Desconocido",
};

let allRepos = [];
let sortKey = "fullName";
let sortDir = 1;

async function init() {
  const res = await fetch("data/report.json", { cache: "no-store" });
  const report = await res.json();
  allRepos = report.repos ?? [];

  const generatedAtEl = document.getElementById("generated-at");
  generatedAtEl.textContent = report.generatedAt
    ? `Último escaneo: ${new Date(report.generatedAt).toLocaleString("es-ES")} · ${allRepos.length} repositorios`
    : "Aún no se ha ejecutado ningún escaneo. Corre el workflow 'Escaneo de obsolescencia' en GitHub Actions.";

  populateFilter("language-filter", [...new Set(allRepos.map((r) => r.language).filter(Boolean))]);
  populateFilter("owner-filter", [...new Set(allRepos.map((r) => r.owner))]);

  document.getElementById("search").addEventListener("input", render);
  document.getElementById("language-filter").addEventListener("change", render);
  document.getElementById("owner-filter").addEventListener("change", render);
  document.getElementById("status-filter").addEventListener("change", render);

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1;
      else {
        sortKey = key;
        sortDir = 1;
      }
      render();
    });
  });

  render();
}

function populateFilter(id, values) {
  const select = document.getElementById(id);
  for (const value of [...values].sort()) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function getSortValue(repo, key) {
  if (key === "eolStatus") return repo.eol?.status ?? "";
  if (key === "vulnTotal") return repo.vulnerabilities?.total ?? 0;
  if (key === "recommendedVersion") return repo.recommended?.version ?? "";
  return repo[key] ?? "";
}

function render() {
  const search = document.getElementById("search").value.trim().toLowerCase();
  const language = document.getElementById("language-filter").value;
  const owner = document.getElementById("owner-filter").value;
  const status = document.getElementById("status-filter").value;

  const filtered = allRepos.filter((repo) => {
    if (search && !repo.fullName.toLowerCase().includes(search)) return false;
    if (language && repo.language !== language) return false;
    if (owner && repo.owner !== owner) return false;
    if (status && (repo.eol?.status ?? "unknown") !== status) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    if (av < bv) return -1 * sortDir;
    if (av > bv) return 1 * sortDir;
    return 0;
  });

  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";
  document.getElementById("empty-state").hidden = filtered.length > 0;

  for (const repo of filtered) {
    const row = document.createElement("tr");

    const repoCell = document.createElement("td");
    const link = document.createElement("a");
    link.href = repo.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = repo.fullName;
    repoCell.appendChild(link);

    const languageCell = document.createElement("td");
    languageCell.textContent = repo.language ?? "—";

    const versionCell = document.createElement("td");
    versionCell.textContent = repo.languageVersion ?? "No detectada";

    const eolCell = document.createElement("td");
    eolCell.appendChild(buildEolBadge(repo.eol));

    const recommendedCell = document.createElement("td");
    recommendedCell.appendChild(buildRecommendedBadge(repo));

    const vulnCell = document.createElement("td");
    vulnCell.appendChild(buildVulnBadge(repo.vulnerabilities));

    row.append(repoCell, languageCell, versionCell, eolCell, recommendedCell, vulnCell);
    tbody.appendChild(row);
  }
}

function buildEolBadge(eol) {
  const span = document.createElement("span");
  if (!eol || eol.status === "unknown") {
    span.className = "badge badge-unknown";
    span.textContent = "Desconocido";
    return span;
  }
  const label = STATUS_LABELS[eol.status] ?? eol.status;
  span.className = `badge badge-${eol.status}`;
  span.textContent = eol.eolDate ? `${label} (${eol.eolDate})` : label;
  return span;
}

function buildRecommendedBadge(repo) {
  const span = document.createElement("span");
  const recommended = repo.recommended;

  if (!recommended || !recommended.version) {
    span.className = "badge badge-unknown";
    span.textContent = "—";
    return span;
  }

  const isUpToDate = repo.eol?.cycle && repo.eol.cycle === recommended.cycle;
  span.className = isUpToDate ? "badge badge-supported" : "badge badge-near-eol";
  span.textContent = isUpToDate ? `${recommended.version} (al día)` : recommended.version;
  return span;
}

function buildVulnBadge(vuln) {
  const span = document.createElement("span");
  if (!vuln || !vuln.available) {
    span.className = "badge badge-unknown";
    span.textContent = "No disponible";
    return span;
  }
  if (vuln.total === 0) {
    span.className = "badge badge-supported";
    span.textContent = "0";
    return span;
  }
  const parts = [];
  if (vuln.critical) parts.push(`${vuln.critical} crítica${vuln.critical > 1 ? "s" : ""}`);
  if (vuln.high) parts.push(`${vuln.high} alta${vuln.high > 1 ? "s" : ""}`);
  if (vuln.medium) parts.push(`${vuln.medium} media${vuln.medium > 1 ? "s" : ""}`);
  if (vuln.low) parts.push(`${vuln.low} baja${vuln.low > 1 ? "s" : ""}`);

  const severity = vuln.critical || vuln.high ? "eol" : "near-eol";
  span.className = `badge badge-${severity}`;
  span.title = parts.join(", ");
  span.textContent = String(vuln.total);
  return span;
}

init().catch((err) => {
  document.getElementById("table-body").innerHTML =
    `<tr><td colspan="6">Error cargando el reporte: ${err.message}</td></tr>`;
});
