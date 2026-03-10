import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const TEMPLATES_DIR = path.resolve(import.meta.dirname, "../templates");

describe("app-router template", () => {
  const dir = path.join(TEMPLATES_DIR, "app-router");

  it("has required files", () => {
    const required = [
      "app/layout.tsx",
      "app/page.tsx",
      "app/api/hello/route.ts",
      "vite.config.ts",
      "tsconfig.json",
      "wrangler.jsonc.tmpl",
      "package.json.tmpl",
      "_gitignore",
    ];
    for (const file of required) {
      expect(fs.existsSync(path.join(dir, file)), `missing: ${file}`).toBe(true);
    }
  });

  it("package.json.tmpl has RSC deps", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json.tmpl"), "utf-8"));
    expect(pkg.dependencies["@vitejs/plugin-rsc"]).toBeDefined();
    expect(pkg.dependencies["react-server-dom-webpack"]).toBeDefined();
  });

  it("package.json.tmpl has type module", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json.tmpl"), "utf-8"));
    expect(pkg.type).toBe("module");
  });

  it("package.json.tmpl has correct scripts", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json.tmpl"), "utf-8"));
    expect(pkg.scripts.dev).toBe("vite dev");
    expect(pkg.scripts.build).toBe("vite build");
  });

  it("vite.config.ts has cloudflare and RSC env config", () => {
    const config = fs.readFileSync(path.join(dir, "vite.config.ts"), "utf-8");
    expect(config).toContain("cloudflare");
    expect(config).toContain("rsc");
    expect(config).toContain("childEnvironments");
  });

  it("wrangler.jsonc.tmpl has {{WORKER_NAME}} placeholder", () => {
    const content = fs.readFileSync(path.join(dir, "wrangler.jsonc.tmpl"), "utf-8");
    expect(content).toContain("{{WORKER_NAME}}");
  });

  it("_gitignore exists (not .gitignore)", () => {
    expect(fs.existsSync(path.join(dir, "_gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".gitignore"))).toBe(false);
  });

  it("package.json.tmpl has {{PROJECT_NAME}} placeholder", () => {
    const content = fs.readFileSync(path.join(dir, "package.json.tmpl"), "utf-8");
    expect(content).toContain("{{PROJECT_NAME}}");
  });

  it("wrangler.jsonc.tmpl uses vinext entry (no custom worker)", () => {
    const content = fs.readFileSync(path.join(dir, "wrangler.jsonc.tmpl"), "utf-8");
    expect(content).toContain("vinext/server/app-router-entry");
    expect(content).not.toContain("./worker/index.ts");
  });
});

describe("pages-router template", () => {
  const dir = path.join(TEMPLATES_DIR, "pages-router");

  it("has required files", () => {
    const required = [
      "pages/index.tsx",
      "pages/about.tsx",
      "pages/api/hello.ts",
      "worker/index.ts",
      "vite.config.ts",
      "tsconfig.json",
      "next-shims.d.ts",
      "wrangler.jsonc.tmpl",
      "package.json.tmpl",
      "_gitignore",
    ];
    for (const file of required) {
      expect(fs.existsSync(path.join(dir, file)), `missing: ${file}`).toBe(true);
    }
  });

  it("package.json.tmpl lacks RSC deps", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json.tmpl"), "utf-8"));
    expect(pkg.dependencies["@vitejs/plugin-rsc"]).toBeUndefined();
    expect(pkg.dependencies["react-server-dom-webpack"]).toBeUndefined();
  });

  it("package.json.tmpl has type module", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json.tmpl"), "utf-8"));
    expect(pkg.type).toBe("module");
  });

  it("package.json.tmpl has correct scripts", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json.tmpl"), "utf-8"));
    expect(pkg.scripts.dev).toBe("vite dev");
    expect(pkg.scripts.build).toBe("vite build");
  });

  it("vite.config.ts has cloudflare plugin without RSC", () => {
    const config = fs.readFileSync(path.join(dir, "vite.config.ts"), "utf-8");
    expect(config).toContain("cloudflare");
    expect(config).not.toContain("rsc");
    expect(config).not.toContain("childEnvironments");
  });

  it("wrangler.jsonc.tmpl has {{WORKER_NAME}} placeholder", () => {
    const content = fs.readFileSync(path.join(dir, "wrangler.jsonc.tmpl"), "utf-8");
    expect(content).toContain("{{WORKER_NAME}}");
  });

  it("_gitignore exists (not .gitignore)", () => {
    expect(fs.existsSync(path.join(dir, "_gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".gitignore"))).toBe(false);
  });

  it("has worker entry for Pages Router", () => {
    const worker = fs.readFileSync(path.join(dir, "worker/index.ts"), "utf-8");
    expect(worker).toContain("virtual:vinext-server-entry");
    expect(worker).toContain("fetch");
  });
});
