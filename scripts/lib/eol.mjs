const cache = new Map();

async function fetchProduct(product) {
  if (cache.has(product)) return cache.get(product);
  let data = [];
  try {
    const res = await fetch(`https://endoflife.date/api/${product}.json`);
    if (res.ok) data = await res.json();
  } catch {
    data = [];
  }
  cache.set(product, data);
  return data;
}

function normalizeVersion(raw) {
  return String(raw).replace(/^[\^~>=<v]+/, "").trim();
}

function candidateCycles(rawVersion) {
  const clean = normalizeVersion(rawVersion);
  const parts = clean.split(".");
  const candidates = [clean];
  if (parts.length > 1) candidates.push(parts.slice(0, 2).join("."));
  if (parts.length > 0) candidates.push(parts[0]);
  return [...new Set(candidates)];
}

// productKey: slug de endoflife.date (nodejs, python, java, go, dotnet, ...)
export async function resolveEol(productKey, rawVersion, nearThresholdDays) {
  if (!rawVersion) return { status: "unknown", eolDate: null, cycle: null };

  const data = await fetchProduct(productKey);
  const candidates = candidateCycles(rawVersion);
  const match = data.find((c) => candidates.includes(String(c.cycle)));

  if (!match) return { status: "unknown", eolDate: null, cycle: null };

  if (match.eol === false || match.eol === undefined) {
    return { status: "supported", eolDate: null, cycle: match.cycle };
  }

  const eolDate = new Date(match.eol);
  const daysLeft = (eolDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

  let status;
  if (daysLeft < 0) status = "eol";
  else if (daysLeft <= nearThresholdDays) status = "near-eol";
  else status = "supported";

  return { status, eolDate: match.eol, cycle: match.cycle };
}

// Versión recomendada a la que migrar: la más reciente que siga soportada.
// endoflife.date devuelve los ciclos en orden reverso-cronológico (el más
// nuevo primero), así que basta con tomar el primero que siga vigente. Si el
// producto marca ciclos LTS (Node.js, .NET, ...), se prioriza el LTS más
// reciente sobre una versión "current" de vida más corta.
export async function getRecommendedVersion(productKey) {
  const data = await fetchProduct(productKey);
  if (!data.length) return null;

  const now = Date.now();
  const isSupported = (c) => c.eol === false || (c.eol && new Date(c.eol).getTime() > now);
  const supported = data.filter(isSupported);
  const pool = supported.length ? supported : data;

  // `lts` puede ser `true`, `false`, o (en Node.js/.NET) la fecha en que ese
  // ciclo *empieza* a ser LTS — si esa fecha todavía no llegó, el ciclo aún
  // no es LTS, aunque el campo sea "truthy".
  const isCurrentlyLts = (c) => {
    if (c.lts === true) return true;
    if (typeof c.lts === "string") {
      const ltsDate = new Date(c.lts);
      return !Number.isNaN(ltsDate.getTime()) && ltsDate.getTime() <= now;
    }
    return false;
  };

  const hasLtsInfo = pool.some((c) => c.lts !== undefined);
  const best = hasLtsInfo ? pool.find(isCurrentlyLts) ?? pool[0] : pool[0];
  if (!best) return null;

  return {
    version: best.latest ?? String(best.cycle),
    cycle: String(best.cycle),
    eolDate: best.eol || null,
  };
}
