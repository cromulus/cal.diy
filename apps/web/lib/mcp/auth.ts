import process from "node:process";
import { hashAPIKey } from "@calcom/features/api-keys-legacy/api-keys/lib/apiKeys";
import prisma from "@calcom/prisma";
import { authenticateOidc } from "./oidc";

export async function authenticateMcp(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  const prefix = process.env.API_KEY_PREFIX ?? "cal_";
  if (!token) return null;
  if (!token.startsWith(prefix)) return authenticateOidc(token);
  const key = await prisma.apiKey.findUnique({
    where: { hashedKey: hashAPIKey(token.slice(prefix.length)) },
    select: {
      expiresAt: true,
      teamId: true,
      user: { select: { id: true, uuid: true, email: true, locked: true } },
    },
  });
  if (!key?.user || key.user.locked || key.teamId) return null;
  if (key.expiresAt && key.expiresAt <= new Date()) return null;
  return key.user;
}
