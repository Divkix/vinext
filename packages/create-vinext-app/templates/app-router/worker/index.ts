// @ts-nocheck -- template file, modules resolved in scaffolded project
import handler from "vinext/server/app-router-entry";

export default {
  async fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return handler.fetch(request, env, ctx);
  },
};
