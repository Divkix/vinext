import { expect, test, describe, beforeEach, afterEach } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffold, sanitizeWorkerName } from "../src/scaffold.js";
import { getTemplateVersions } from "../src/catalog.js";

describe("integration: App Router template", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vinext-app-router-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("scaffolds complete App Router project", () => {
    const projectName = "my-app";
    const projectPath = path.join(tmpDir, projectName);
    const versionVars = getTemplateVersions();

    scaffold({
      projectPath,
      projectName,
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      versionVars,
    });

    // Core directory structure
    expect(fs.existsSync(projectPath)).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "app"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "public"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "worker"))).toBe(true);

    // Essential files
    expect(fs.existsSync(path.join(projectPath, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "tsconfig.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "vite.config.ts"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "wrangler.jsonc"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, ".gitignore"))).toBe(true);

    // App Router specific files
    expect(fs.existsSync(path.join(projectPath, "app", "layout.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "app", "page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "app", "globals.css"))).toBe(true);

    // Worker entry
    expect(fs.existsSync(path.join(projectPath, "worker", "index.ts"))).toBe(true);

    // Template variables substituted
    const pkgContent = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
    expect(pkgContent.name).toBe("my-app");

    // Dependencies from catalog versions
    expect(pkgContent.dependencies.vinext).toBeDefined();
    expect(pkgContent.dependencies.vinext).not.toContain("{{");
    expect(pkgContent.dependencies.react).toBeDefined();
    expect(pkgContent.dependencies["react-dom"]).toBeDefined();
    expect(pkgContent.dependencies.wrangler).toBeDefined();
  });

  test("sanitizes worker name for wrangler.jsonc", () => {
    const projectName = "@org/My-App_V2.0";
    const projectPath = path.join(tmpDir, "my-app");
    const versionVars = getTemplateVersions();

    scaffold({
      projectPath,
      projectName,
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      versionVars,
    });

    const wranglerContent = fs.readFileSync(path.join(projectPath, "wrangler.jsonc"), "utf-8");
    const workerName = sanitizeWorkerName(projectName);
    expect(wranglerContent).toContain(`"name": "${workerName}"`);
  });

  test("package.json uses catalog versions for dependencies", () => {
    const projectPath = path.join(tmpDir, "test-app");
    const versionVars = getTemplateVersions();

    scaffold({
      projectPath,
      projectName: "test-app",
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      versionVars,
    });

    const pkgContent = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));

    // Dependencies should be real versions, not {{VARS}}
    expect(pkgContent.dependencies.vinext).not.toContain("{{");
    expect(pkgContent.dependencies.react).not.toContain("{{");
    expect(pkgContent.dependencies["react-dom"]).not.toContain("{{");

    // Dev dependencies should be real versions (when they exist in devDependencies)
    if (pkgContent.devDependencies) {
      if (pkgContent.devDependencies["@cloudflare/workers-types"]) {
        expect(pkgContent.devDependencies["@cloudflare/workers-types"]).not.toContain("{{");
      }
      if (pkgContent.devDependencies.typescript) {
        expect(pkgContent.devDependencies.typescript).not.toContain("{{");
      }
    }
  });
});

describe("integration: Pages Router template", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vinext-pages-router-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("scaffolds complete Pages Router project", () => {
    const projectName = "my-website";
    const projectPath = path.join(tmpDir, projectName);
    const versionVars = getTemplateVersions();

    scaffold({
      projectPath,
      projectName,
      template: "pages",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      versionVars,
    });

    // Core directory structure
    expect(fs.existsSync(projectPath)).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "pages"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "worker"))).toBe(true);

    // Essential files
    expect(fs.existsSync(path.join(projectPath, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "tsconfig.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "vite.config.ts"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "wrangler.jsonc"))).toBe(true);

    // Pages Router specific files
    expect(fs.existsSync(path.join(projectPath, "pages", "index.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "pages", "about.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "pages", "api", "hello.ts"))).toBe(true);

    // Worker entry with full middleware/routing
    expect(fs.existsSync(path.join(projectPath, "worker", "index.ts"))).toBe(true);

    // Template variables substituted
    const pkgContent = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
    expect(pkgContent.name).toBe("my-website");
  });

  test("worker entry delegates to vinext pages-router handler", () => {
    const projectPath = path.join(tmpDir, "test-pages");
    const versionVars = getTemplateVersions();

    scaffold({
      projectPath,
      projectName: "test-pages",
      template: "pages",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      versionVars,
    });

    const workerContent = fs.readFileSync(path.join(projectPath, "worker", "index.ts"), "utf-8");

    // Should delegate to vinext/server/pages-router-entry
    expect(workerContent).toContain("vinext/server/pages-router-entry");
    expect(workerContent).toContain("handler.fetch");
    expect(workerContent).toContain("export default");
  });

  test("pages contain valid React component structure", () => {
    const projectPath = path.join(tmpDir, "test-links");
    const versionVars = getTemplateVersions();

    scaffold({
      projectPath,
      projectName: "test-links",
      template: "pages",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      versionVars,
    });

    const indexContent = fs.readFileSync(path.join(projectPath, "pages", "index.tsx"), "utf-8");
    const aboutContent = fs.readFileSync(path.join(projectPath, "pages", "about.tsx"), "utf-8");

    // Both pages should be valid React components
    expect(indexContent).toContain("export default function");
    expect(aboutContent).toContain("export default function");
    expect(indexContent).toContain("<main>");
    expect(indexContent).toContain("<h1>");
  });
});

describe("integration: both templates", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vinext-both-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("scaffolded projects have valid TypeScript config", () => {
    const versionVars = getTemplateVersions();

    // Test App Router
    const appPath = path.join(tmpDir, "app-test");
    scaffold({
      projectPath: appPath,
      projectName: "app-test",
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      versionVars,
    });

    const appTsConfig = JSON.parse(fs.readFileSync(path.join(appPath, "tsconfig.json"), "utf-8"));
    expect(appTsConfig.compilerOptions).toBeDefined();
    expect(appTsConfig.compilerOptions.strict).toBe(true);

    // Test Pages Router
    const pagesPath = path.join(tmpDir, "pages-test");
    scaffold({
      projectPath: pagesPath,
      projectName: "pages-test",
      template: "pages",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      versionVars,
    });

    const pagesTsConfig = JSON.parse(
      fs.readFileSync(path.join(pagesPath, "tsconfig.json"), "utf-8"),
    );
    expect(pagesTsConfig.compilerOptions).toBeDefined();
    expect(pagesTsConfig.compilerOptions.strict).toBe(true);
  });

  test("scaffolded projects have valid vite.config.ts", () => {
    const versionVars = getTemplateVersions();

    // Test both templates
    ["app", "pages"].forEach((template) => {
      const projectPath = path.join(tmpDir, `${template}-vite-test`);
      scaffold({
        projectPath,
        projectName: `${template}-test`,
        template: template as "app" | "pages",
        install: false,
        git: false,
        pm: "npm",
        vinextVersion: "^0.0.0",
        versionVars,
      });

      const viteConfig = fs.readFileSync(path.join(projectPath, "vite.config.ts"), "utf-8");
      expect(viteConfig).toContain("vinext()");
      expect(viteConfig).toContain("cloudflare");
      expect(viteConfig).toContain("@cloudflare/vite-plugin");
    });
  });

  test("scaffolded wrangler.jsonc has valid structure", () => {
    const versionVars = getTemplateVersions();

    ["app", "pages"].forEach((template) => {
      const projectPath = path.join(tmpDir, `${template}-wrangler-test`);
      const projectName = `${template}-wrangler-test`;

      scaffold({
        projectPath,
        projectName,
        template: template as "app" | "pages",
        install: false,
        git: false,
        pm: "npm",
        vinextVersion: "^0.0.0",
        versionVars,
      });

      const wranglerContent = fs.readFileSync(path.join(projectPath, "wrangler.jsonc"), "utf-8");

      // Should be valid JSONC (we can parse by removing comments)
      const cleanJson = wranglerContent.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

      const wranglerConfig = JSON.parse(cleanJson);
      expect(wranglerConfig.name).toBe(sanitizeWorkerName(projectName));
      expect(wranglerConfig.main).toBeDefined();
    });
  });

  test("_gitignore renamed to .gitignore in both templates", () => {
    const versionVars = getTemplateVersions();

    ["app", "pages"].forEach((template) => {
      const projectPath = path.join(tmpDir, `${template}-gitignore-test`);

      scaffold({
        projectPath,
        projectName: `${template}-test`,
        template: template as "app" | "pages",
        install: false,
        git: false,
        pm: "npm",
        vinextVersion: "^0.0.0",
        versionVars,
      });

      expect(fs.existsSync(path.join(projectPath, ".gitignore"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "_gitignore"))).toBe(false);

      const gitignoreContent = fs.readFileSync(path.join(projectPath, ".gitignore"), "utf-8");
      expect(gitignoreContent).toContain("node_modules");
    });
  });
});
