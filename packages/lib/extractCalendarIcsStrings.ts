const VCALENDAR_PATTERN = /BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/g;

const decodeQuotedPrintable = (value: string): string =>
  value
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));

const decodeMimeBody = (headers: string, body: string): string => {
  const transferEncoding = headers.match(/content-transfer-encoding:\s*([^\r\n]+)/i)?.[1]?.toLowerCase();

  if (transferEncoding === "base64") {
    return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
  }

  if (transferEncoding === "quoted-printable") {
    return decodeQuotedPrintable(body);
  }

  return body;
};

const splitHeadersAndBody = (value: string): { headers: string; body: string } | null => {
  const separatorMatch = /\r?\n\r?\n/.exec(value);
  if (!separatorMatch) return null;

  const separatorIndex = separatorMatch.index;
  return {
    headers: value.slice(0, separatorIndex),
    body: value.slice(separatorIndex + separatorMatch[0].length),
  };
};

const extractBoundaryParts = (rawEmail: string): string[] => {
  const boundaries = Array.from(rawEmail.matchAll(/boundary="?([^";\r\n]+)"?/gi), (match) => match[1]).filter(
    (boundary): boundary is string => !!boundary
  );

  return boundaries.flatMap((boundary) =>
    rawEmail.split(`--${boundary}`).filter((part) => part.trim() && !part.trim().startsWith("--"))
  );
};

export const extractCalendarIcsStrings = (input: string | null | undefined): string[] => {
  if (!input) return [];

  const directMatches: string[] = input.match(VCALENDAR_PATTERN) ?? [];
  const mimePartMatches: string[] = extractBoundaryParts(input).flatMap((part) => {
    const parsedPart = splitHeadersAndBody(part);
    if (!parsedPart) return [];

    const decodedBody = decodeMimeBody(parsedPart.headers, parsedPart.body);
    const isCalendarPart =
      /content-type:\s*text\/calendar/i.test(parsedPart.headers) ||
      /filename="?[^"\r\n;]+\.ics"?/i.test(parsedPart.headers);

    VCALENDAR_PATTERN.lastIndex = 0;
    const matches = decodedBody.match(VCALENDAR_PATTERN) ?? [];
    if (!isCalendarPart && matches.length === 0) return [];

    return matches;
  });

  return Array.from(new Set(directMatches.concat(mimePartMatches)));
};
