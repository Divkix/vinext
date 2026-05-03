import { expect, test, describe, beforeEach, afterEach } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { sanitizeWorkerName, scaffold } from "../src/scaffold.js";

describe("sanitizeWorkerName", () => {
  test("returns lowercase name unchanged", () => {
    expect(sanitizeWorkerName("my-app")).toBe("my-app");
  });

  test("lowercases uppercase input", () => {
    expect(sanitizeWorkerName("My-App")).toBe("my-app");
  });

  test("strips scope from scoped names", () => {
    expect(sanitizeWorkerName("@org/my-app")).toBe("my-app");
  });

  test("replaces special characters with hyphens", () => {
    expect(sanitizeWorkerName("my_app.with.dots")).toBe("my-app-with-dots");
  });

  test("strips leading and trailing hyphens", () => {
    expect(sanitizeWorkerName("-leading")).toBe("leading");
    expect(sanitizeWorkerName("trailing-")).toBe("trailing");
  });

  test("collapses consecutive hyphens", () => {
    expect(sanitizeWorkerName("a--b---c")).toBe("a-b-c");
  });
});

describe("scaffold", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vinext-scaffold-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates project directory", () => {
    const projectPath = path.join(tmpDir, "test-project");
    scaffold({
      projectPath,
      projectName: "test-project",
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      _exec: () => {},
    });
    expect(fs.existsSync(projectPath)).toBe(true);
    expect(fs.statSync(projectPath).isDirectory()).toBe(true);
  });

  test("substitutes template variables in .tmpl files", () => {
    // Create a minimal template directory
    const templateDir = path.join(tmpDir, "template");
    fs.mkdirSync(path.join(templateDir, "subdir"), { recursive: true });
    fs.writeFileSync(
      path.join(templateDir, "package.json.tmpl"),
      JSON.stringify({ name: "{{PROJECT_NAME}}", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(templateDir, "subdir", "config.ts.tmpl"),
      'export const name = "{{PROJECT_NAME}}";',
    );
    // Also test catalog version substitution
    fs.writeFileSync(
      path.join(templateDir, "deps.json.tmpl"),
      JSON.stringify({ react: "{{REACT_VERSION}}" }),
    );

    const projectPath = path.join(tmpDir, "test-project");
    scaffold({
      projectPath,
      projectName: "my-app",
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      versionVars: { "{{REACT_VERSION}}": "^19.0.0" },
      _templateDir: templateDir,
      _exec: () => {},
    });

    // .tmpl file should be processed and renamed
    const pkgContent = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
    expect(pkgContent.name).toBe("my-app");

    const configContent = fs.readFileSync(path.join(projectPath, "subdir", "config.ts"), "utf-8");
    expect(configContent).toContain('"my-app"');

    // Catalog version substitution
    const depsContent = JSON.parse(fs.readFileSync(path.join(projectPath, "deps.json"), "utf-8"));
    expect(depsContent.react).toBe("^19.0.0");

    // Original .tmpl files should be gone
    expect(fs.existsSync(path.join(projectPath, "package.json.tmpl"))).toBe(false);
    expect(fs.existsSync(path.join(projectPath, "deps.json.tmpl"))).toBe(false);
  });

  test("renames _gitignore to .gitignore", () => {
    // Create a template with _gitignore
    const templateDir = path.join(tmpDir, "template");
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(templateDir, "_gitignore"), "node_modules\n");

    const projectPath = path.join(tmpDir, "test-project");
    scaffold({
      projectPath,
      projectName: "test-project",
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      _templateDir: templateDir,
      _exec: () => {},
    });

    expect(fs.existsSync(path.join(projectPath, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "_gitignore"))).toBe(false);
  });

  test("does not create .gitignore if _gitignore does not exist in template", () => {
    const templateDir = path.join(tmpDir, "template");
    fs.mkdirSync(templateDir, { recursive: true });

    const projectPath = path.join(tmpDir, "test-project");
    scaffold({
      projectPath,
      projectName: "test-project",
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      _templateDir: templateDir,
      _exec: () => {},
    });

    // .gitignore should not be created since _gitignore didn't exist
    expect(fs.existsSync(path.join(projectPath, ".gitignore"))).toBe(false);
  });
});
