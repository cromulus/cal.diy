"use client";

import type { Context, ReactElement, ReactNode } from "react";
import { createContext, useMemo } from "react";

type LocaleContextType = {
  translations: Record<string, string>;
  ns: string;
  locale: string;
};

const AppRouterI18nContext: Context<LocaleContextType | null> = createContext<LocaleContextType | null>(null);
const CustomI18nContext: Context<LocaleContextType | null> = createContext<LocaleContextType | null>(null);

function LocaleProvider({
  children,
  translations,
  locale,
  ns,
  context,
}: LocaleContextType & {
  children: ReactNode;
  context: typeof AppRouterI18nContext | typeof CustomI18nContext;
}): ReactElement {
  const value = useMemo(
    () => ({
      translations,
      locale,
      ns,
    }),
    [translations, locale, ns]
  );
  const ContextProvider = context.Provider;

  return <ContextProvider value={value}>{children}</ContextProvider>;
}

function AppRouterI18nProvider(props: LocaleContextType & { children: ReactNode }): ReactElement {
  return <LocaleProvider {...props} context={AppRouterI18nContext} />;
}

function CustomI18nProvider(props: LocaleContextType & { children: ReactNode }): ReactElement {
  return <LocaleProvider {...props} context={CustomI18nContext} />;
}

export { AppRouterI18nContext, AppRouterI18nProvider, CustomI18nContext, CustomI18nProvider };
export type { LocaleContextType };
