import { describe, it, expect } from "vitest";
import { detectPackageManager, buildInstallCommand } from "../src/install.js";

describe("detectPackageManager", () => {
  it("detects bun from user agent", () => {
    expect(
      detectPackageManager({
        npm_config_user_agent: "bun/1.2.0 npm/? node/v22",
      }),
    ).toBe("bun");
  });

  it("detects pnpm from user agent", () => {
    expect(
      detectPackageManager({
        npm_config_user_agent: "pnpm/9.0.0 npm/? node/v22",
      }),
    ).toBe("pnpm");
  });

  it("detects yarn from user agent", () => {
    expect(
      detectPackageManager({
        npm_config_user_agent: "yarn/4.0.0 npm/? node/v22",
      }),
    ).toBe("yarn");
  });

  it("detects npm from user agent", () => {
    expect(
      detectPackageManager({
        npm_config_user_agent: "npm/10.0.0 node/v22",
      }),
    ).toBe("npm");
  });

  it("falls back to npm when no env vars", () => {
    expect(detectPackageManager({})).toBe("npm");
  });

  it("falls back to npm when user agent is undefined", () => {
    expect(detectPackageManager({ npm_config_user_agent: undefined })).toBe("npm");
  });
});

describe("buildInstallCommand", () => {
  it("returns correct command for npm", () => {
    expect(buildInstallCommand("npm")).toEqual(["npm", "install"]);
  });

  it("returns correct command for bun", () => {
    expect(buildInstallCommand("bun")).toEqual(["bun", "install"]);
  });

  it("returns correct command for pnpm", () => {
    expect(buildInstallCommand("pnpm")).toEqual(["pnpm", "install"]);
  });

  it("returns correct command for yarn", () => {
    expect(buildInstallCommand("yarn")).toEqual(["yarn"]);
  });
});
