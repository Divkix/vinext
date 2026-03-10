import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CLI_PATH = path.resolve(import.meta.dirname, "../dist/index.js");

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-vinext-app-e2e-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function run(args: string[]): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
      cwd: tmpDir,
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (err.stdout ?? "") + (err.stderr ?? ""),
      exitCode: err.status ?? 1,
    };
  }
}

describe("e2e", () => {
  it("--help exits 0 and prints usage", () => {
    const { stdout, exitCode } = run(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("create-vinext-app");
    expect(stdout).toContain("--template");
  });

  it("--version exits 0 and prints semver", () => {
    const { stdout, exitCode } = run(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("scaffolds app-router project", () => {
    const { exitCode } = run(["my-app", "-y", "--skip-install", "--no-git"]);
    expect(exitCode).toBe(0);

    const projectDir = path.join(tmpDir, "my-app");
    expect(fs.existsSync(path.join(projectDir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "app/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "app/layout.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "vite.config.ts"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "wrangler.jsonc"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, ".gitignore"))).toBe(true);

    // Verify template variables were substituted
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf-8"));
    expect(pkg.name).toBe("my-app");

    // No .tmpl files should remain
    expect(fs.existsSync(path.join(projectDir, "package.json.tmpl"))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, "wrangler.jsonc.tmpl"))).toBe(false);
  });

  it("scaffolds pages-router project", () => {
    const { exitCode } = run([
      "my-pages-app",
      "-y",
      "--template",
      "pages",
      "--skip-install",
      "--no-git",
    ]);
    expect(exitCode).toBe(0);

    const projectDir = path.join(tmpDir, "my-pages-app");
    expect(fs.existsSync(path.join(projectDir, "pages/index.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "worker/index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "next-shims.d.ts"))).toBe(true);

    // Should NOT have app/ directory
    expect(fs.existsSync(path.join(projectDir, "app"))).toBe(false);
  });

  it("invalid name exits 1", () => {
    const { stdout, exitCode } = run(["node_modules", "-y"]);
    expect(exitCode).toBe(1);
    expect(stdout.toLowerCase()).toContain("invalid");
  });
});
