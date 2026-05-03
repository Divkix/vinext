const KNOWN_PMS = new Set(["pnpm", "yarn", "bun"]);

export function detectPackageManager(
  env: Record<string, string | undefined> = process.env,
): "npm" | "pnpm" | "yarn" | "bun" {
  const ua = env.npm_config_user_agent;
  if (!ua) return "npm";
  const name = ua.trim().toLowerCase().split(" ")[0]?.split("/")[0];
  if (name && KNOWN_PMS.has(name)) return name as "pnpm" | "yarn" | "bun";
  return "npm";
}

export function buildInstallCommand(pm: "npm" | "pnpm" | "yarn" | "bun"): string[] {
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
