import fs from "node:fs";
import path from "node:path";

type ValidationResult =
  | { valid: true; normalized?: string; useCwd?: boolean }
  | { valid: false; message: string };

const RESERVED_NAMES = new Set([
  "node_modules",
  "favicon.ico",
  "package.json",
  "package-lock.json",
]);

const IGNORABLE_FILES = new Set([".git", ".DS_Store", ".gitkeep", "Thumbs.db"]);

/**
 * Validates a project name against npm naming conventions and additional
 * constraints for project directory creation.
 */
export function validateProjectName(name: string): ValidationResult {
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
    return {
      valid: false,
      message: "Project name must be 214 characters or fewer",
    };
  }

  if (/\s/.test(name)) {
    return {
      valid: false,
      message: "Project name cannot contain spaces",
    };
  }

  // Scoped package names: @scope/name
  const nameToValidate = name.startsWith("@") ? name : name;

  if (!/^[a-zA-Z0-9\-._@/]+$/.test(nameToValidate)) {
    return {
      valid: false,
      message:
        "Project name can only contain lowercase letters, numbers, hyphens, dots, underscores, and scoped package prefixes (@org/)",
    };
  }

  // Determine the "bare" name for start-char validation.
  // For scoped names like @org/app, validate the part after the slash.
  const bareName = name.startsWith("@") ? (name.split("/").pop() ?? name) : name;

  if (/^\d/.test(bareName)) {
    return {
      valid: false,
      message: "Project name cannot start with a number",
    };
  }

  if (bareName.startsWith("-")) {
    return {
      valid: false,
      message: "Project name cannot start with a hyphen",
    };
  }

  if (name !== name.toLowerCase()) {
    return { valid: true, normalized: name.toLowerCase() };
  }

  return { valid: true };
}

/**
 * Resolves a project name to an absolute directory path.
 */
export function resolveProjectPath(name: string, cwd: string): string {
  if (name === ".") {
    return cwd;
  }

  if (path.isAbsolute(name)) {
    return name;
  }

  return path.resolve(cwd, name);
}

/**
 * Checks whether a directory is empty or contains only ignorable dotfiles.
 * Returns true if the directory does not exist.
 */
export function isDirectoryEmpty(dir: string): boolean {
  if (!fs.existsSync(dir)) {
    return true;
  }

  const entries = fs.readdirSync(dir);
  return entries.every((entry) => IGNORABLE_FILES.has(entry));
}
