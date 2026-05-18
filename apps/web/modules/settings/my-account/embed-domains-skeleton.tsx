"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import SectionBottomActions from "@calcom/features/settings/SectionBottomActions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SkeletonButton, SkeletonContainer, SkeletonText } from "@calcom/ui/components/skeleton";

export const SkeletonLoader = () => {
  const { t } = useLocale();

  return (
    <SettingsHeader title={t("embed_domains")} description={t("embed_domains_description")}>
      <SkeletonContainer>
        <div className="border-subtle mt-6 rounded-t-lg border p-6">
          <SkeletonText className="h-5 w-40" />
          <SkeletonText className="mt-3 h-20 w-full" />
        </div>
        <SectionBottomActions align="end">
          <SkeletonButton className="mr-6 h-8 w-24 rounded-md p-5" />
        </SectionBottomActions>
      </SkeletonContainer>
    </SettingsHeader>
  );
};
