// Spec: odd/tasks/owner-live-e2e-audit.md, S2. Every live client answers from the owner API:
// no module a live client loads at runtime may reach the demo data in shared/data/mock.ts.
// Type-only imports are erased at build time, so they are not followed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MOCK = join(appRoot, "shared/data/mock.ts");

describe("live clients read the owner API, never the demo data", () => {
  for (const client of liveClientModules()) {
    it(`${relative(appRoot, client)} loads no demo data`, () => {
      assert.deepEqual(pathToMock(client), null);
    });
  }

  it("finds the live clients it audits", () => {
    assert.ok(liveClientModules().length >= 7);
  });

  it("does see the demo data behind a demo client, so a live import of it would fail", () => {
    assert.notEqual(pathToMock(join(appRoot, "features/content/services/postsService.ts")), null);
  });
});

// The modules that talk to the owner API in live mode: live*.ts and *ApiClient.ts.
function liveClientModules(): string[] {
  return ["features", "shared"]
    .flatMap((dir) => sourceFiles(join(appRoot, dir)))
    .filter((file) => /\/live[A-Z][^/]*\.ts$|ApiClient\.ts$/.test(file))
    .sort();
}

// The chain of runtime imports from `start` to the mock, or null when it never gets there.
function pathToMock(start: string): string[] | null {
  const seen = new Set<string>();
  const walk = (file: string, chain: string[]): string[] | null => {
    if (file === MOCK) return [...chain, relative(appRoot, file)];
    if (seen.has(file)) return null;
    seen.add(file);
    for (const next of runtimeImports(file)) {
      const found = walk(next, [...chain, relative(appRoot, file)]);
      if (found) return found;
    }
    return null;
  };
  return walk(start, []);
}

function runtimeImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers = [...source.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)]
    .map((match) => match[1]!);
  return specifiers.map((specifier) => resolveModule(dirname(file), specifier)).filter((path) => path !== null);
}

function resolveModule(fromDir: string, specifier: string): string | null {
  const base = resolve(fromDir, specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")];
  return candidates.find((path) => /\.tsx?$/.test(path) && exists(path)) ?? null;
}

function exists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });
}
