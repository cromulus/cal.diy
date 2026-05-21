import { useAtomsContext } from "@calcom/atoms/hooks/useAtomsContext";
import type { i18n as I18n, TFunction } from "i18next";
import { createInstance } from "i18next";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import type { LocaleContextType } from "./useLocaleContext";
import { AppRouterI18nContext, CustomI18nContext } from "./useLocaleContext";

type useLocaleReturnType = {
  i18n: I18n;
  t: TFunction;
  isLocaleReady: boolean;
};

// @internal
const useClientLocale = (
  namespace: Parameters<typeof useTranslation>[0] = "common",
  i18nInstance?: I18n
): useLocaleReturnType => {
  const context = useAtomsContext();
  let translationOptions: Parameters<typeof useTranslation>[1];
  if (i18nInstance) {
    translationOptions = { i18n: i18nInstance };
  }
  const { i18n, t } = useTranslation(namespace, translationOptions);
  const isLocaleReady = Object.keys(i18n).length > 0;
  if (context?.clientId) {
    return { i18n: context.i18n, t: context.t, isLocaleReady: true } as unknown as useLocaleReturnType;
  }
  return {
    i18n,
    t,
    isLocaleReady,
  };
};

// @internal
const serverI18nInstances: Map<string, useLocaleReturnType> = new Map();

function getServerI18nInstance({ translations, locale, ns }: LocaleContextType): useLocaleReturnType {
  const instanceKey = `${locale}-${ns}`;
  const serverI18nInstance = serverI18nInstances.get(instanceKey);

  if (serverI18nInstance) {
    return serverI18nInstance;
  }

  const i18n = createInstance();
  i18n.init({
    lng: locale,
    resources: {
      [locale]: {
        [ns]: translations,
      },
    },
  });

  const nextServerI18nInstance = {
    t: i18n.getFixedT(locale, ns),
    isLocaleReady: true,
    i18n,
  };
  serverI18nInstances.set(instanceKey, nextServerI18nInstance);

  return nextServerI18nInstance;
}

export const useLocale = (): useLocaleReturnType => {
  const appRouterContext = useContext(AppRouterI18nContext);
  const customI18nContext = useContext(CustomI18nContext);
  let serverI18nInstance: useLocaleReturnType | null = null;
  if (appRouterContext) {
    serverI18nInstance = getServerI18nInstance(customI18nContext ?? appRouterContext);
  }
  const clientI18n = useClientLocale("common", serverI18nInstance?.i18n);

  if (serverI18nInstance) {
    return serverI18nInstance;
  }

  console.warn(
    "useLocale hook is being used outside of App Router - hence this hook will use a global, client-side i18n which can cause a small flicker"
  );
  return {
    t: clientI18n.t,
    isLocaleReady: clientI18n.isLocaleReady,
    i18n: clientI18n.i18n,
  };
};
