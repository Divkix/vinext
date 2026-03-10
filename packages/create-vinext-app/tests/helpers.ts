import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "create-vinext-app-test-"));
}

export function readFile(dir: string, relativePath: string): string {
  return fs.readFileSync(path.join(dir, relativePath), "utf-8");
}

export function fileExists(dir: string, relativePath: string): boolean {
  return fs.existsSync(path.join(dir, relativePath));
}

export function readJson(dir: string, relativePath: string): Record<string, unknown> {
  return JSON.parse(readFile(dir, relativePath));
}

/** No-op exec for tests -- records calls for assertions */
export function noopExec(): {
  exec: (cmd: string, args: string[], opts: { cwd: string }) => void;
  calls: Array<{ cmd: string; args: string[]; cwd: string }>;
} {
  const calls: Array<{ cmd: string; args: string[]; cwd: string }> = [];
  return {
    exec: (cmd: string, args: string[], opts: { cwd: string }) => {
      calls.push({ cmd, args, cwd: opts.cwd });
    },
    calls,
  };
}
