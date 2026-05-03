import { expect, test, describe } from "vite-plus/test";
import { detectPackageManager, buildInstallCommand } from "../src/install.js";

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
