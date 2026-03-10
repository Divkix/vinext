export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export function detectPackageManager(
  env: Record<string, string | undefined> = process.env,
): PackageManager {
  const ua = env.npm_config_user_agent;
  if (!ua) return "npm";

  const name = ua.trim().toLowerCase().split(" ")[0]?.split("/")[0];
  if (name === "pnpm" || name === "yarn" || name === "bun") return name;
  return "npm";
}

export function buildInstallCommand(pm: PackageManager): string[] {
  switch (pm) {
    case "bun":
      return ["bun", "install"];
    case "pnpm":
      return ["pnpm", "install"];
    case "yarn":
      return ["yarn"];
    case "npm":
      return ["npm", "install"];
  }
}
