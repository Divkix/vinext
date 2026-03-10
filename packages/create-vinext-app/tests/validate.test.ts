import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { validateProjectName, resolveProjectPath, isDirectoryEmpty } from "../src/validate.js";

describe("validateProjectName", () => {
  it("rejects empty string", () => {
    const result = validateProjectName("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.message).toMatch(/required/i);
    }
  });

  it("accepts valid name 'my-app'", () => {
    const result = validateProjectName("my-app");
    expect(result).toEqual({ valid: true });
  });

  it("rejects names with spaces", () => {
    const result = validateProjectName("my app");
    expect(result.valid).toBe(false);
  });

  it("rejects special characters", () => {
    const result = validateProjectName("my@app!");
    expect(result.valid).toBe(false);
  });

  it("normalizes uppercase to lowercase", () => {
    const result = validateProjectName("MyApp");
    expect(result).toEqual({ valid: true, normalized: "myapp" });
  });

  it("rejects names starting with a number", () => {
    const result = validateProjectName("123app");
    expect(result.valid).toBe(false);
  });

  it("rejects names starting with a hyphen", () => {
    const result = validateProjectName("-app");
    expect(result.valid).toBe(false);
  });

  it("rejects reserved npm names", () => {
    const result = validateProjectName("node_modules");
    expect(result.valid).toBe(false);
  });

  it("accepts scoped names like '@org/app'", () => {
    const result = validateProjectName("@org/app");
    expect(result).toEqual({ valid: true });
  });

  it("rejects names longer than 214 characters", () => {
    const result = validateProjectName("a".repeat(215));
    expect(result.valid).toBe(false);
  });

  it("accepts dot '.' for current working directory", () => {
    const result = validateProjectName(".");
    expect(result).toEqual({ valid: true, useCwd: true });
  });
});

describe("resolveProjectPath", () => {
  it("resolves relative path against cwd", () => {
    expect(resolveProjectPath("my-app", "/home/user")).toBe("/home/user/my-app");
  });

  it("returns absolute path as-is", () => {
    expect(resolveProjectPath("/abs/path", "/home")).toBe("/abs/path");
  });

  it("resolves dot to cwd", () => {
    expect(resolveProjectPath(".", "/home/user")).toBe("/home/user");
  });
});

describe("isDirectoryEmpty", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vinext-validate-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns true for an empty directory", () => {
    expect(isDirectoryEmpty(tmpDir)).toBe(true);
  });

  it("returns false for a non-empty directory", () => {
    fs.writeFileSync(path.join(tmpDir, "index.ts"), "");
    expect(isDirectoryEmpty(tmpDir)).toBe(false);
  });

  it("returns true for directory with only ignorable dotfiles", () => {
    fs.mkdirSync(path.join(tmpDir, ".git"));
    fs.writeFileSync(path.join(tmpDir, ".DS_Store"), "");
    expect(isDirectoryEmpty(tmpDir)).toBe(true);
  });

  it("returns true for a non-existent directory", () => {
    const nonExistent = path.join(tmpDir, "does-not-exist");
    expect(isDirectoryEmpty(nonExistent)).toBe(true);
  });
});
