import { NextRequest } from "next/server";

export function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization")?.trim();
  if (auth === `Bearer ${secret}`) return true;

  return req.headers.get("x-cron-secret")?.trim() === secret;
}
