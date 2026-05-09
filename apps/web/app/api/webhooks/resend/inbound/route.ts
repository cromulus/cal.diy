import process from "node:process";
import { handleResendInboundCalendarReply } from "@calcom/features/calendar-replies/lib/ResendInboundCalendarReplyService";
import { verifySvixWebhook } from "@calcom/lib/server/verifySvixWebhook";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const payload = await request.text();

  const isVerified = verifySvixWebhook({
    payload,
    headers: request.headers,
    secret: process.env.RESEND_WEBHOOK_SECRET,
  });

  if (!isVerified) {
    return NextResponse.json({ success: false, message: "Invalid webhook signature" }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  const result = await handleResendInboundCalendarReply(event);

  return NextResponse.json({ success: true, ...result });
};
