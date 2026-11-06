import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function npm(args, cwd) {
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error("Run this validation through its npm script.");
  return execFileSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
}

export function createPackedConsumer() {
  const directory = mkdtempSync(join(tmpdir(), "planetary-grid-consumer-"));
  const packed = JSON.parse(
    npm(["pack", "--ignore-scripts", "--json", "--pack-destination", directory], packageRoot)
  )[0];
  const files = new Set(packed.files.map((file) => file.path));
  for (const required of ["README.md", "LICENSE", "NOTICE", "dist/index.js", "dist/index.d.ts"]) {
    if (!files.has(required)) throw new Error(`Missing package file: ${required}`);
  }
  if ([...files].some((file) => /^(src|tests|fixtures|scripts|node_modules)\//.test(file))) {
    throw new Error("The npm runtime payload includes development-only files.");
  }
  writeFileSync(join(directory, "package.json"), '{"private":true,"type":"module"}\n');
  npm(
    [
      "install",
      "--ignore-scripts",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      join(directory, packed.filename),
    ],
    directory
  );
  const manifest = JSON.parse(
    readFileSync(
      join(directory, "node_modules/@bfeist/planetary-grid-reference/package.json"),
      "utf8"
    )
  );
  return {
    directory,
    manifest,
    cleanup() {
      const expectedParent = resolve(tmpdir());
      if (
        dirname(directory) !== expectedParent ||
        !directory.startsWith(join(expectedParent, "planetary-grid-consumer-"))
      ) {
        throw new Error("Refusing to remove a directory outside the validation temporary path.");
      }
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
