import { isEmbedReferrerAllowed } from "@calcom/lib/embedAllowedDomains";
import { WebAppURL } from "@calcom/lib/WebAppURL";
import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import { notFound, redirect } from "next/navigation";

type InternalEmbedProps = {
  embedAllowedDomains?: string[];
};

const getRequestReferrer = (context: GetServerSidePropsContext) => {
  const referrer = context.req.headers.referer ?? context.req.headers.referrer;
  return Array.isArray(referrer) ? referrer[0] : referrer;
};

const stripInternalEmbedProps = <T extends Record<string, unknown>>(props: T & InternalEmbedProps) => {
  const { embedAllowedDomains: _embedAllowedDomains, ...clientProps } = props;
  return clientProps as T;
};

const withEmbedSsrAppDir =
  <T extends Record<string, unknown> & EmbedProps>(getServerSideProps: GetServerSideProps<T>) =>
  async (context: GetServerSidePropsContext): Promise<T> => {
    const { embed, layout } = context.query;
    const ssrResponse = await getServerSideProps(context);

    if ("redirect" in ssrResponse) {
      const destinationUrl = ssrResponse.redirect.destination;
      let urlPrefix = "";

      // Get the URL parsed from URL so that we can reliably read pathname and searchParams from it.
      const destinationUrlObj = new WebAppURL(ssrResponse.redirect.destination);

      // If it's a complete URL, use the origin as the prefix to ensure we redirect to the same domain.
      if (destinationUrl.search(/^(http:|https:).*/) !== -1) {
        urlPrefix = destinationUrlObj.origin;
      } else {
        // Don't use any prefix for relative URLs to ensure we stay on the same domain
        urlPrefix = "";
      }

      const destinationQueryStr = destinationUrlObj.searchParams.toString();
      // Make sure that redirect happens to /embed page and pass on embed query param as is for preserving Cal JS API namespace
      const newDestinationUrl = `${urlPrefix}${destinationUrlObj.pathname}/embed?${
        destinationQueryStr ? `${destinationQueryStr}&` : ""
      }layout=${layout}&embed=${embed}`;
      return redirect(newDestinationUrl);
    }

    if ("notFound" in ssrResponse) {
      return notFound();
    }

    const props = (await Promise.resolve(ssrResponse.props)) as T & InternalEmbedProps;
    if (
      !isEmbedReferrerAllowed({
        referrer: getRequestReferrer(context),
        allowedDomains: props.embedAllowedDomains ?? [],
      })
    ) {
      return notFound();
    }

    return {
      ...stripInternalEmbedProps(props),
      isEmbed: true,
    } as T;
  };

export type EmbedProps = {
  isEmbed?: boolean;
};

export default withEmbedSsrAppDir;
