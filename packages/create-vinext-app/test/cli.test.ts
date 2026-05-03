import { expect, test, describe } from "vite-plus/test";
import { detectPackageManager, buildInstallCommand } from "../src/install.js";
import { validateProjectName, resolveProjectPath } from "../src/validate.js";
import { getTemplateVersions } from "../src/catalog.js";

describe("detectPackageManager", () => {
  test("returns npm when npm_config_user_agent is missing", () => {
    expect(detectPackageManager({})).toBe("npm");
  });

  test("returns npm when npm_config_user_agent is empty", () => {
    expect(detectPackageManager({ npm_config_user_agent: "" })).toBe("npm");
  });

  test("detects pnpm from user agent", () => {
    expect(
      detectPackageManager({
        npm_config_user_agent: "pnpm/8.15.0 npm/? node/v20.11.0 darwin arm64",
      }),
    ).toBe("pnpm");
  });

  test("detects yarn from user agent", () => {
    expect(
      detectPackageManager({
        npm_config_user_agent: "yarn/1.22.22 npm/? node/v20.11.0 darwin arm64",
      }),
    ).toBe("yarn");
  });

  test("detects bun from user agent", () => {
    expect(
      detectPackageManager({ npm_config_user_agent: "bun/1.2.0 npm/? node/v20.11.0 darwin arm64" }),
    ).toBe("bun");
  });

  test("detects npm from user agent", () => {
    expect(
      detectPackageManager({ npm_config_user_agent: "npm/10.2.0 node/v20.11.0 darwin arm64" }),
    ).toBe("npm");
  });

  test("handles unknown user agent by returning npm", () => {
    expect(detectPackageManager({ npm_config_user_agent: "yolo/1.0.0" })).toBe("npm");
  });
});

describe("buildInstallCommand", () => {
  test("returns npm install for npm", () => {
    expect(buildInstallCommand("npm")).toEqual(["npm", "install"]);
  });

  test("returns pnpm install for pnpm", () => {
    expect(buildInstallCommand("pnpm")).toEqual(["pnpm", "install"]);
  });

  test("returns yarn for yarn (yarn install is implicit)", () => {
    expect(buildInstallCommand("yarn")).toEqual(["yarn"]);
  });

  test("returns bun install for bun", () => {
    expect(buildInstallCommand("bun")).toEqual(["bun", "install"]);
  });
});

describe("validateProjectName", () => {
  test("rejects empty name", () => {
    expect(validateProjectName("")).toEqual({ valid: false, message: "Project name is required" });
  });

  test("accepts '.' and returns useCwd", () => {
    expect(validateProjectName(".")).toEqual({ valid: true, useCwd: true });
  });

  test("rejects reserved names", () => {
    expect(validateProjectName("node_modules").valid).toBe(false);
    expect(validateProjectName("package.json").valid).toBe(false);
    expect(validateProjectName("favicon.ico").valid).toBe(false);
  });

  test("rejects names over 214 chars", () => {
    expect(validateProjectName("a".repeat(215)).valid).toBe(false);
  });

  test("rejects names with spaces", () => {
    expect(validateProjectName("my app").valid).toBe(false);
  });

  test("rejects names with invalid characters", () => {
    expect(validateProjectName("my!app").valid).toBe(false);
  });

  test("accepts valid names", () => {
    expect(validateProjectName("my-app")).toEqual({ valid: true });
    expect(validateProjectName("my_app")).toEqual({ valid: true });
    expect(validateProjectName("my.app")).toEqual({ valid: true });
  });

  test("auto-normalizes uppercase to lowercase", () => {
    const result = validateProjectName("My-App");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.normalized).toBe("my-app");
    }
  });

  test("accepts scoped names", () => {
    expect(validateProjectName("@org/my-app")).toEqual({ valid: true });
  });

  test("rejects scoped names with invalid format", () => {
    expect(validateProjectName("@/my-app").valid).toBe(false);
    expect(validateProjectName("@org/").valid).toBe(false);
  });

  test("rejects names starting with a number", () => {
    expect(validateProjectName("123app").valid).toBe(false);
  });

  test("rejects names starting with a hyphen", () => {
    expect(validateProjectName("-leading").valid).toBe(false);
  });
});

describe("resolveProjectPath", () => {
  test("returns cwd for '.'", () => {
    expect(resolveProjectPath(".", "/home/user")).toBe("/home/user");
  });

  test("resolves relative paths", () => {
    expect(resolveProjectPath("my-app", "/home/user")).toBe("/home/user/my-app");
  });

  test("returns absolute paths as-is", () => {
    expect(resolveProjectPath("/tmp/my-app", "/home/user")).toBe("/tmp/my-app");
  });
});

describe("getTemplateVersions", () => {
  test("returns an object with expected keys (or empty object)", () => {
    const versions = getTemplateVersions();
    // When running in monorepo, should have all keys
    // When running standalone, returns empty object (no-op)
    if (Object.keys(versions).length > 0) {
      expect(versions["{{VINEXT_VERSION}}"]).toBeDefined();
      expect(versions["{{RSC_VERSION}}"]).toBeDefined();
      expect(versions["{{RSDW_VERSION}}"]).toBeDefined();
      expect(versions["{{REACT_VERSION}}"]).toBeDefined();
      expect(versions["{{REACT_DOM_VERSION}}"]).toBeDefined();
      expect(versions["{{PLUGIN_REACT_VERSION}}"]).toBeDefined();
      expect(versions["{{CF_PLUGIN_VERSION}}"]).toBeDefined();
      expect(versions["{{CF_TYPES_VERSION}}"]).toBeDefined();
      expect(versions["{{VITE_VERSION}}"]).toBeDefined();
      expect(versions["{{VITE_PLUS_VERSION}}"]).toBeDefined();
      expect(versions["{{WRANGLER_VERSION}}"]).toBeDefined();
      expect(versions["{{TS_VERSION}}"]).toBeDefined();
    }
  });

  test("returns version values that look like reasonable strings", () => {
    const versions = getTemplateVersions();
    for (const [, value] of Object.entries(versions)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
