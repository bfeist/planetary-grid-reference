import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve("scripts/npm-release.mjs");
let directory: string;
let publishingCommit: string;

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
}

function prepare(version = "0.2.0") {
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "@bfeist/planetary-grid-reference", version })
  );
  writeFileSync(
    join(directory, "package-lock.json"),
    JSON.stringify({ version, packages: { "": { version } } })
  );
}

function run(registry: Record<string, unknown>) {
  const mock = join(directory, "registry.mjs");
  writeFileSync(
    mock,
    `const registry = ${JSON.stringify(registry)};
globalThis.fetch = async (url) => {
  const version = decodeURIComponent(new URL(url).pathname.split('/').pop());
  const data = registry[version];
  return new Response(JSON.stringify(data ?? {}), { status: data ? 200 : 404 });
};`
  );
  const output = join(directory, "output");
  writeFileSync(output, "");
  const result = spawnSync(process.execPath, ["--import", pathToFileURL(mock).href, script], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: output },
  });
  return { ...result, output: readFileSync(output, "utf8") };
}

describe("npm release recovery", () => {
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "pgr-release-"));
    git("init", "--quiet");
    git("config", "user.name", "Release Test");
    git("config", "user.email", "release@example.invalid");
    git("config", "commit.gpgsign", "false");
    prepare();
    git("add", "package.json", "package-lock.json");
    git("commit", "--quiet", "-m", "Publishing commit");
    publishingCommit = git("rev-parse", "HEAD");
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("publishes a new version from the current commit", () => {
    const result = run({});
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe(
      `action=publish\ntag=v0.2.0\ndist_tag=latest\ncommit=${publishingCommit}\n`
    );
  });

  it("creates a GitHub Release for an already published and tagged version", () => {
    git("tag", "v0.2.0");
    git("commit", "--quiet", "--allow-empty", "-m", "Later workflow fix");
    const result = run({ "0.2.0": { gitHead: publishingCommit } });
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("action=release\n");
    expect(result.output).toContain(`commit=${publishingCommit}\n`);
  });

  it("recovers a missing tag on the npm commit after main has advanced", () => {
    git("commit", "--quiet", "--allow-empty", "-m", "Later workflow fix");
    const result = run({ "0.2.0": { gitHead: publishingCommit } });
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("action=tag\n");
    expect(result.output).toContain(`commit=${publishingCommit}\n`);
    expect(git("rev-parse", "HEAD")).not.toBe(publishingCommit);
  });

  it("rejects a tag that differs from the published npm commit", () => {
    git("commit", "--quiet", "--allow-empty", "-m", "Different commit");
    git("tag", "v0.2.0");
    const result = run({ "0.2.0": { gitHead: publishingCommit } });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("point to different commits");
    expect(result.output).toBe("");
  });

  it("rejects recovery from a commit that does not contain the npm release", () => {
    git("checkout", "--quiet", "--orphan", "unrelated");
    git("commit", "--quiet", "-m", "Unrelated history");
    const result = run({ "0.2.0": { gitHead: publishingCommit } });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("is not an ancestor");
    expect(result.output).toBe("");
  });

  it("keeps prereleases on the beta distribution tag", () => {
    prepare("0.3.0-beta.1");
    const result = run({});
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("tag=v0.3.0-beta.1\ndist_tag=beta\n");
  });

  it("rejects a new version that does not descend from npm latest", () => {
    const result = run({ latest: { gitHead: "0".repeat(40) } });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("npm latest release is not an ancestor");
  });
});
