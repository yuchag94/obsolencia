import { getFileContent } from "../github.mjs";

export async function detectJava(octokit, owner, repo) {
  const pom = await getFileContent(octokit, owner, repo, "pom.xml");
  if (pom) {
    const patterns = [
      /<maven\.compiler\.release>([^<]+)<\/maven\.compiler\.release>/,
      /<maven\.compiler\.source>([^<]+)<\/maven\.compiler\.source>/,
      /<java\.version>([^<]+)<\/java\.version>/,
    ];
    for (const pattern of patterns) {
      const match = pom.match(pattern);
      if (match) return { version: match[1].trim(), source: "pom.xml" };
    }
  }

  const gradle =
    (await getFileContent(octokit, owner, repo, "build.gradle")) ??
    (await getFileContent(octokit, owner, repo, "build.gradle.kts"));
  if (gradle) {
    const match = gradle.match(/sourceCompatibility\s*=?\s*(?:JavaVersion\.VERSION_)?['"]?(\d+(?:_\d+)?)['"]?/);
    if (match) return { version: match[1].replace("_", "."), source: "build.gradle sourceCompatibility" };
  }

  return null;
}
