import { userMetadata as userMetadataSchema } from "@calcom/prisma/zod-utils";
import { normalizeEmbedAllowedDomains } from "./embedAllowedDomains";

export const getEmbedAllowedDomainsFromUserMetadata = (metadata: unknown) => {
  const parsedMetadata = userMetadataSchema.safeParse(metadata);
  if (!parsedMetadata.success) return [];

  return normalizeEmbedAllowedDomains(parsedMetadata.data?.embedAllowedDomains ?? []);
};
