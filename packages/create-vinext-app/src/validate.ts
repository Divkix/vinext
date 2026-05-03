import fs from "node:fs";
import path from "node:path";

const RESERVED_NAMES = new Set([
  "node_modules",
  "favicon.ico",
  "package.json",
  "package-lock.json",
]);

export function validateProjectName(name: string):
  | {
      valid: true;
      useCwd?: true;
      normalized?: string;
    }
  | {
      valid: false;
      message: string;
    } {
  if (name === "") {
    return { valid: false, message: "Project name is required" };
  }
  if (name === ".") {
    return { valid: true, useCwd: true };
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    return {
      valid: false,
      message: `"${name}" is a reserved name and cannot be used as a project name`,
    };
  }
  if (name.length > 214) {
    return { valid: false, message: "Project name must be 214 characters or fewer" };
  }
  if (/\s/.test(name)) {
    return { valid: false, message: "Project name cannot contain spaces" };
  }
  if (!/^[a-zA-Z0-9\-._@/]+$/.test(name)) {
    return {
      valid: false,
      message:
        "Project name can only contain letters, numbers, hyphens, dots, underscores, and scoped package prefixes (@org/)",
    };
  }

  // Validate scoped package name structure: @scope/name
  if (name.startsWith("@")) {
    if (!/^@[a-z0-9-]+\/[a-z0-9][a-z0-9._-]*$/i.test(name)) {
      return { valid: false, message: 'Scoped package name must be in the format "@scope/name"' };
    }
  }

  // Determine the "bare" name for start-char validation
  const bareName = name.startsWith("@") ? (name.split("/").pop() ?? name) : name;

  if (/^\d/.test(bareName)) {
    return { valid: false, message: "Project name cannot start with a number" };
  }

  if (bareName.startsWith("-")) {
    return { valid: false, message: "Project name cannot start with a hyphen" };
  }

  if (name !== name.toLowerCase()) {
    return { valid: true, normalized: name.toLowerCase() };
  }

  return { valid: true };
}

export function resolveProjectPath(name: string, cwd: string): string {
  if (name === ".") return cwd;
  if (path.isAbsolute(name)) return name;
  return path.resolve(cwd, name);
}

const IGNORABLE_FILES = new Set([".git", ".DS_Store", ".gitkeep", "Thumbs.db"]);

export function isDirectoryEmpty(dir: string): boolean {
  if (!fs.existsSync(dir)) return true;
  const entries = fs.readdirSync(dir);
  return entries.every((entry) => IGNORABLE_FILES.has(entry));
}
