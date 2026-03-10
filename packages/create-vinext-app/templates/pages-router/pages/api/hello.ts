import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.json({
    message: "Hello from vinext on Cloudflare Workers!",
  });
}
