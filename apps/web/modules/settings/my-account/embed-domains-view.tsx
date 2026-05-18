"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import SectionBottomActions from "@calcom/features/settings/SectionBottomActions";
import { parseEmbedAllowedDomainsInput } from "@calcom/lib/embedAllowedDomains";
import { getEmbedAllowedDomainsFromUserMetadata } from "@calcom/lib/getEmbedAllowedDomainsFromUserMetadata";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { Label, TextArea } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { revalidateSettingsEmbedDomains } from "@calcom/web/app/cache/path/settings/my-account";
import { useEffect, useMemo, useState } from "react";

type EmbedDomainsViewProps = {
  user: RouterOutputs["viewer"]["me"]["get"];
};

const EmbedDomainsView = ({ user }: EmbedDomainsViewProps) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const savedAllowedDomainsInput = useMemo(
    () => getEmbedAllowedDomainsFromUserMetadata(user.metadata).join("\n"),
    [user.metadata]
  );
  const [lastSavedAllowedDomainsInput, setLastSavedAllowedDomainsInput] = useState(savedAllowedDomainsInput);
  const [allowedDomainsInput, setAllowedDomainsInput] = useState(savedAllowedDomainsInput);

  useEffect(() => {
    setLastSavedAllowedDomainsInput(savedAllowedDomainsInput);
    setAllowedDomainsInput(savedAllowedDomainsInput);
  }, [savedAllowedDomainsInput]);

  const mutation = trpc.viewer.me.updateProfile.useMutation({
    onSuccess: async (data) => {
      const savedInput = getEmbedAllowedDomainsFromUserMetadata(data.metadata).join("\n");
      setLastSavedAllowedDomainsInput(savedInput);
      setAllowedDomainsInput(savedInput);
      await utils.viewer.me.invalidate();
      await revalidateSettingsEmbedDomains();
      showToast(t("embed_allowed_domains_saved"), "success");
    },
    onError: () => {
      showToast(t("error_updating_settings"), "error");
    },
  });

  const saveAllowedDomains = () => {
    const embedAllowedDomains = parseEmbedAllowedDomainsInput(allowedDomainsInput);
    setAllowedDomainsInput(embedAllowedDomains.join("\n"));
    mutation.mutate({
      metadata: {
        embedAllowedDomains,
      },
    });
  };

  const isDirty = allowedDomainsInput !== lastSavedAllowedDomainsInput;

  return (
    <SettingsHeader title={t("embed_domains")} description={t("embed_domains_description")}>
      <div className="border-subtle mt-6 rounded-t-lg border p-6">
        <Label>
          <div className="text-default mb-2 text-sm font-medium">{t("embed_allowed_domains")}</div>
          <TextArea
            value={allowedDomainsInput}
            onChange={(event) => setAllowedDomainsInput(event.target.value)}
            placeholder={t("embed_allowed_domains_placeholder")}
            rows={6}
          />
        </Label>
        <p className="text-subtle mt-2 text-xs">{t("embed_allowed_domains_description")}</p>
      </div>
      <SectionBottomActions align="end">
        <Button
          type="button"
          color="primary"
          loading={mutation.isPending}
          disabled={!isDirty || mutation.isPending}
          onClick={saveAllowedDomains}>
          {t("save_allowed_domains")}
        </Button>
      </SectionBottomActions>
    </SettingsHeader>
  );
};

export default EmbedDomainsView;
