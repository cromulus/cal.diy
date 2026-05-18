import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import { notFound, redirect } from "next/navigation";

type InternalEmbedProps = {
  embedAllowedDomains?: string[];
};

const stripInternalEmbedProps = <T extends Record<string, unknown>>(props: T & InternalEmbedProps) => {
  const { embedAllowedDomains: _embedAllowedDomains, ...clientProps } = props;
  return clientProps as T;
};

export const withAppDirSsr =
  <T extends Record<string, unknown>>(getServerSideProps: GetServerSideProps<T>) =>
  async (context: GetServerSidePropsContext) => {
    const ssrResponse = await getServerSideProps(context);

    if ("redirect" in ssrResponse) {
      return redirect(ssrResponse.redirect.destination);
    }
    if ("notFound" in ssrResponse) {
      return notFound();
    }

    const props = await Promise.resolve(ssrResponse.props);

    return stripInternalEmbedProps(props);
  };
