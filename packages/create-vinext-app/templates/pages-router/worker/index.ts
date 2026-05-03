// @ts-nocheck -- template file, modules resolved in scaffolded project
import handler from "vinext/server/pages-router-entry";

export default {
  async fetch(request: Request, env?: Record<string, unknown>): Promise<Response> {
    return handler.fetch(request, env);
  },
};
