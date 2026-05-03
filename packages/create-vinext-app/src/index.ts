#!/usr/bin/env node
import path from "node:path";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateProjectName, resolveProjectPath, isDirectoryEmpty } from "./validate.js";
import { detectPackageManager } from "./install.js";
import { scaffold } from "./scaffold.js";
import { getTemplateVersions } from "./catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8"));
const VERSION = pkg.version;

export type CliOptions = {
  yes: boolean;
  skipInstall: boolean;
  noGit: boolean;
  help: boolean;
  version: boolean;
  projectName?: string;
  template?: "app" | "pages";
};

export type { PromptDefaults, PromptAnswers } from "./prompts.js";
export type { ScaffoldOptions } from "./scaffold.js";

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    yes: false,
    skipInstall: false,
    noGit: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--version":
      case "-v":
        opts.version = true;
        break;
      case "--yes":
      case "-y":
        opts.yes = true;
        break;
      case "--skip-install":
        opts.skipInstall = true;
        break;
      case "--no-git":
        opts.noGit = true;
        break;
      case "--template": {
        i++;
        const tmpl = argv[i];
        if (tmpl !== "app" && tmpl !== "pages") {
          console.error(`Invalid template: "${tmpl}". Must be "app" or "pages".`);
          process.exit(1);
        }
        opts.template = tmpl;
        break;
      }
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        if (!opts.projectName) {
          opts.projectName = arg;
        }
        break;
    }
  }

  return opts;
}

function printHelp(): void {
  console.log(`
create-vinext-app v${VERSION}

Scaffold a new vinext project targeting Cloudflare Workers.

Usage:
  create-vinext-app [project-name] [options]

Options:
  --template <app|pages>   Router template (default: app)
  --yes, -y                Skip prompts, use defaults
  --skip-install           Skip dependency installation
  --no-git                 Skip git init
  --help, -h               Show help
  --version, -v            Show version

Examples:
  npm create vinext-app@latest
  npm create vinext-app@latest my-app
  npm create vinext-app@latest my-app --template pages
  npm create vinext-app@latest my-app --yes --skip-install
`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(argv);

  if (opts.help) {
    printHelp();
    return;
  }

  if (opts.version) {
    console.log(VERSION);
    return;
  }

  let projectName: string | undefined;
  let template: "app" | "pages";

  if (opts.yes || !process.stdin.isTTY) {
    projectName = opts.projectName ?? "my-vinext-app";
    template = opts.template ?? "app";
  } else {
    const { runPrompts } = await import("./prompts.js");
    const answers = await runPrompts({
      projectName: opts.projectName,
      template: opts.template,
    });
    if (!answers) return;
    projectName = answers.projectName;
    template = answers.template;
  }

  // After initialization, projectName is always a string
  const projectNameStr: string = projectName;

  // Handle path-like project names
  let targetDir: string | undefined;
  const looksLikePath =
    path.isAbsolute(projectNameStr) ||
    projectNameStr.startsWith("./") ||
    projectNameStr.startsWith("../") ||
    projectNameStr.startsWith(".\\") ||
    projectNameStr.startsWith("..\\") ||
    projectNameStr.includes(path.sep) ||
    projectNameStr.includes("/");

  let finalProjectName = projectNameStr;

  if (looksLikePath) {
    targetDir = path.resolve(projectNameStr);
    finalProjectName = path.basename(targetDir);
  }

  // Validate project name
  let validation = validateProjectName(finalProjectName);
  if (!validation.valid) {
    console.error(`Invalid project name: ${validation.message}`);
    process.exit(1);
  }

  // Handle "." (current directory)
  if (validation.valid && "useCwd" in validation && validation.useCwd) {
    targetDir = process.cwd();
    finalProjectName = path.basename(process.cwd());
    validation = validateProjectName(finalProjectName);
    if (!validation.valid) {
      console.error(`Invalid project name derived from cwd: ${validation.message}`);
      process.exit(1);
    }
  }

  const normalizedName =
    validation.valid && "normalized" in validation && validation.normalized
      ? validation.normalized
      : finalProjectName;

  const projectPath = targetDir ?? resolveProjectPath(normalizedName, process.cwd());

  // Check directory is empty
  if (!isDirectoryEmpty(projectPath)) {
    console.error(`Directory "${projectPath}" is not empty.`);
    process.exit(1);
  }

  const pm = detectPackageManager();
  const catalogVars = getTemplateVersions();

  scaffold({
    projectPath,
    projectName: normalizedName,
    template,
    install: !opts.skipInstall,
    git: !opts.noGit,
    pm,
    vinextVersion: `^${VERSION}`,
    versionVars: catalogVars,
  });

  // Success message
  const relativePath = path.relative(process.cwd(), projectPath);
  console.log("");
  console.log(`Success! Created ${normalizedName} at ${projectPath}`);
  console.log("");
  console.log("Next steps:");
  if (relativePath && relativePath !== ".") {
    console.log(`  cd ${relativePath}`);
  }
  if (opts.skipInstall) {
    const pmCmd = pm === "yarn" ? "yarn" : `${pm} install`;
    console.log(`  ${pmCmd}`);
  }
  console.log(`  ${pm === "npm" ? "npm run" : pm} dev`);
  console.log("");
}

// Auto-run when this is the entry point
const thisFile = path.resolve(fileURLToPath(import.meta.url));
const entryFile = process.argv[1];
if (entryFile) {
  const resolveReal = (p: string) => {
    try {
      return realpathSync(path.resolve(p));
    } catch {
      return path.resolve(p);
    }
  };
  const resolvedEntry = resolveReal(entryFile);
  const resolvedThis = resolveReal(thisFile);
  if (resolvedEntry === resolvedThis || resolvedEntry === resolvedThis.replace(/\.ts$/, ".js")) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
