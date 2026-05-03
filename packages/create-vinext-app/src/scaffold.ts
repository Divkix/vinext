import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildInstallCommand } from "./install.js";

export type ScaffoldOptions = {
  projectPath: string;
  projectName: string;
  displayName?: string;
  template: "app" | "pages";
  install: boolean;
  git: boolean;
  pm: "npm" | "pnpm" | "yarn" | "bun";
  vinextVersion: string;
  versionVars?: Record<string, string>; // Catalog version variables for template substitution
  _exec?: (cmd: string, args: string[], opts: { cwd: string }) => void;
  _templateDir?: string;
};

function defaultExec(cmd: string, args: string[], opts: { cwd: string }): void {
  execFileSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" });
}

export function sanitizeWorkerName(name: string): string {
  const unscoped = name.startsWith("@") ? (name.split("/").pop() ?? name) : name;
  return unscoped
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function processTmplFiles(dir: string, vars: Record<string, string>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processTmplFiles(fullPath, vars);
    } else if (entry.name.endsWith(".tmpl")) {
      let content = fs.readFileSync(fullPath, "utf-8");
      for (const [key, value] of Object.entries(vars)) {
        content = content.replaceAll(key, value);
      }
      const newPath = fullPath.slice(0, -5); // strip .tmpl
      fs.writeFileSync(newPath, content, "utf-8");
      fs.unlinkSync(fullPath);
    }
  }
}

export function scaffold(options: ScaffoldOptions): void {
  const {
    projectPath,
    projectName,
    displayName,
    template,
    install,
    git,
    vinextVersion,
    versionVars,
  } = options;
  const exec = options._exec ?? defaultExec;

  // Create project directory
  fs.mkdirSync(projectPath, { recursive: true });

  // Determine template directory
  const templateDir =
    options._templateDir ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "templates",
      template === "app" ? "app-router" : "pages-router",
    );

  // Copy template files (only if template directory exists)
  if (fs.existsSync(templateDir)) {
    copyDir(templateDir, projectPath);

    // Substitute .tmpl variables (catalog versions + project-specific)
    const workerName = sanitizeWorkerName(projectName);
    processTmplFiles(projectPath, {
      ...versionVars, // Catalog versions (RSC, React, Vite, etc.)
      "{{PROJECT_NAME}}": projectName,
      "{{DISPLAY_NAME}}": displayName ?? projectName,
      "{{WORKER_NAME}}": workerName,
      "{{VINEXT_VERSION}}": vinextVersion,
    });

    // Rename _gitignore -> .gitignore
    const gitignoreSrc = path.join(projectPath, "_gitignore");
    const gitignoreDst = path.join(projectPath, ".gitignore");
    if (fs.existsSync(gitignoreSrc)) {
      fs.renameSync(gitignoreSrc, gitignoreDst);
    }
  }

  // Git init
  if (git) {
    exec("git", ["init"], { cwd: projectPath });
  }

  // Install deps (if requested)
  if (install) {
    const [cmd, ...args] = buildInstallCommand(options.pm);
    exec(cmd, args, { cwd: projectPath });
  }
}
