import process from "node:process";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { NextResponse } from "next/server";

async function getHandler(): Promise<NextResponse> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();

  if (!publicKey) {
    return NextResponse.json(
      { error: "VAPID public key is not configured" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "no-store" } });
}

export const dynamic = "force-dynamic";
export const GET: ReturnType<typeof defaultResponderForAppDir> = defaultResponderForAppDir(getHandler);
