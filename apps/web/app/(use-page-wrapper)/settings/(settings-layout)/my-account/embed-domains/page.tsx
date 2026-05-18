import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { meRouter } from "@calcom/trpc/server/routers/viewer/me/_router";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { createRouterCaller } from "app/_trpc/context";
import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import EmbedDomainsView from "~/settings/my-account/embed-domains-view";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("embed_domains"),
    (t) => t("embed_domains_description"),
    undefined,
    undefined,
    "/settings/my-account/embed-domains"
  );

const Page = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  const redirectUrl = "/auth/login?callbackUrl=/settings/my-account/embed-domains";

  if (!session?.user?.id) {
    return redirect(redirectUrl);
  }

  const meCaller = await createRouterCaller(meRouter);
  const user = await meCaller.get();
  if (!user) {
    redirect(redirectUrl);
  }

  return <EmbedDomainsView user={user} />;
};

export default Page;
