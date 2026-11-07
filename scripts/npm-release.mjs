import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));
const { name, version } = manifest;
if (lockfile.version !== version || lockfile.packages[""].version !== version) {
  throw new Error("package.json and package-lock.json must have the same release version.");
}

const tag = `v${version}`;
const distTag = version.includes("-") ? "beta" : "latest";
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const existingTag = execFileSync("git", ["tag", "--list", tag], { encoding: "utf8" }).trim();
const tagCommit = existingTag
  ? execFileSync("git", ["rev-list", "-1", `refs/tags/${tag}`], { encoding: "utf8" }).trim()
  : null;

async function npmVersion(spec) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(spec)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry lookup failed (${response.status}) for ${spec}.`);
  return response.json();
}

const published = await npmVersion(version);
let action = "skip";
if (published) {
  if (tagCommit && published.gitHead && tagCommit !== published.gitHead) {
    throw new Error(`${tag} and the npm version point to different commits.`);
  }
  // A failed tag push can be retried on the original publishing commit.
  if (published.gitHead === commit && !tagCommit) action = "tag";
} else {
  if (tagCommit && tagCommit !== commit) {
    throw new Error(`${tag} already points to another commit.`);
  }
  const current = await npmVersion(distTag);
  if (current?.gitHead) {
    const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", current.gitHead, commit]);
    if (ancestry.status !== 0) {
      throw new Error(`The npm ${distTag} release is not an ancestor of this commit.`);
    }
  }
  action = "publish";
}

console.log(`${name}@${version}: ${action} (${tag}, ${distTag})`);
appendFileSync(process.env.GITHUB_OUTPUT, `action=${action}\ntag=${tag}\ndist_tag=${distTag}\n`);
