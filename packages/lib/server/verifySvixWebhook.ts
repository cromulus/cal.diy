import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_WEBHOOK_TIMESTAMP_AGE_SECONDS = 300;

const getHeader = (headers: Headers, name: string): string | null => headers.get(name);

const getSigningSecret = (secret: string): Buffer => {
  let normalizedSecret = secret;
  if (normalizedSecret.startsWith("whsec_")) {
    normalizedSecret = normalizedSecret.slice("whsec_".length);
  }
  return Buffer.from(normalizedSecret, "base64");
};

const parseSignatures = (signatureHeader: string): string[] =>
  signatureHeader.split(" ").flatMap((signature) => {
    const [version, value] = signature.split(",");
    if (version !== "v1" || !value) return [];
    return [value];
  });

export const verifySvixWebhook = ({
  payload,
  headers,
  secret,
}: {
  payload: string;
  headers: Headers;
  secret: string | undefined;
}): boolean => {
  if (!secret) return false;

  const id = getHeader(headers, "svix-id");
  const timestamp = getHeader(headers, "svix-timestamp");
  const signatureHeader = getHeader(headers, "svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;

  const timestampAgeSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (timestampAgeSeconds > MAX_WEBHOOK_TIMESTAMP_AGE_SECONDS) return false;

  const signedContent = `${id}.${timestamp}.${payload}`;
  const expectedSignature = createHmac("sha256", getSigningSecret(secret))
    .update(signedContent)
    .digest("base64");

  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  return parseSignatures(signatureHeader).some((signature) => {
    const signatureBuffer = Buffer.from(signature);
    return (
      signatureBuffer.byteLength === expectedSignatureBuffer.byteLength &&
      timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    );
  });
};
