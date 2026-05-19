"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import SectionBottomActions from "@calcom/features/settings/SectionBottomActions";
import { normalizeEmbedAllowedDomains, parseEmbedAllowedDomainsInput } from "@calcom/lib/embedAllowedDomains";
import { getEmbedAllowedDomainsFromUserMetadata } from "@calcom/lib/getEmbedAllowedDomainsFromUserMetadata";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { Label } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { revalidateSettingsEmbedDomains } from "@calcom/web/app/cache/path/settings/my-account";
import { XIcon } from "@coss/ui/icons";
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type EmbedDomainsViewProps = {
  user: RouterOutputs["viewer"]["me"]["get"];
};
type UpdateProfileOutput = RouterOutputs["viewer"]["me"]["updateProfile"];

const areDomainListsEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((domain, index) => domain === right[index]);

const EmbedDomainsView = ({ user }: EmbedDomainsViewProps): JSX.Element => {
  const { t } = useLocale();
  const domainInputId = useId();
  const domainInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const savedAllowedDomains = useMemo(
    () => getEmbedAllowedDomainsFromUserMetadata(user.metadata),
    [user.metadata]
  );
  const [lastSavedAllowedDomains, setLastSavedAllowedDomains] = useState(savedAllowedDomains);
  const [allowedDomains, setAllowedDomains] = useState(savedAllowedDomains);
  const [domainInput, setDomainInput] = useState("");

  useEffect(() => {
    setLastSavedAllowedDomains(savedAllowedDomains);
    setAllowedDomains(savedAllowedDomains);
    setDomainInput("");
  }, [savedAllowedDomains]);

  const mutation = trpc.viewer.me.updateProfile.useMutation({
    onSuccess: async (data: UpdateProfileOutput): Promise<void> => {
      const savedDomains = getEmbedAllowedDomainsFromUserMetadata(data.metadata);
      setLastSavedAllowedDomains(savedDomains);
      setAllowedDomains(savedDomains);
      setDomainInput("");
      await utils.viewer.me.invalidate();
      await revalidateSettingsEmbedDomains();
      showToast(t("embed_allowed_domains_saved"), "success");
    },
    onError: (): void => {
      showToast(t("error_updating_settings"), "error");
    },
  });

  const addDomainsFromInput = (input: string): boolean => {
    const domainsToAdd = parseEmbedAllowedDomainsInput(input);
    if (!domainsToAdd.length) return false;

    setAllowedDomains((domains) => normalizeEmbedAllowedDomains([...domains, ...domainsToAdd]));
    setDomainInput("");
    return true;
  };

  const removeDomain = (domainIndex: number): void => {
    setAllowedDomains((domains) => domains.filter((_, index) => index !== domainIndex));
  };

  const handleDomainInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Backspace" && !domainInput && allowedDomains.length) {
      event.preventDefault();
      setAllowedDomains((domains) => domains.slice(0, -1));
      return;
    }

    if (event.key !== "Enter" && event.key !== "," && event.key !== " ") return;

    event.preventDefault();
    addDomainsFromInput(domainInput);
  };

  const handleDomainInputPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const pastedValue = event.clipboardData.getData("text");
    if (!/[\s,]+/.test(pastedValue)) return;

    event.preventDefault();
    addDomainsFromInput(`${domainInput} ${pastedValue}`);
  };

  const nextAllowedDomains = useMemo(
    () => normalizeEmbedAllowedDomains([...allowedDomains, ...parseEmbedAllowedDomainsInput(domainInput)]),
    [allowedDomains, domainInput]
  );
  const isDirty = !areDomainListsEqual(nextAllowedDomains, lastSavedAllowedDomains);
  let domainInputPlaceholder = "";
  if (!allowedDomains.length) domainInputPlaceholder = t("embed_allowed_domains_placeholder");

  const focusDomainInput = (): void => {
    domainInputRef.current?.focus();
  };

  const saveAllowedDomains = (): void => {
    const embedAllowedDomains = nextAllowedDomains;
    setAllowedDomains(embedAllowedDomains);
    setDomainInput("");
    mutation.mutate({
      metadata: {
        embedAllowedDomains,
      },
    });
  };

  return (
    <SettingsHeader title={t("embed_domains")} description={t("embed_domains_description")}>
      <div className="mt-6 rounded-t-lg border border-subtle p-6">
        <Label htmlFor={domainInputId}>{t("embed_allowed_domains")}</Label>
        <div
          className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[10px] border border-default bg-default px-2 py-1.5 shadow-outline-gray-rested transition-all focus-within:border-emphasis focus-within:shadow-outline-gray-focused hover:border-emphasis"
          onClick={focusDomainInput}>
          {allowedDomains.map((domain, index) => (
            <div
              key={domain}
              className="flex max-w-full items-center gap-1 rounded-[6px] bg-emphasis px-2 py-1 font-medium text-emphasis text-sm">
              <span className="max-w-[260px] truncate">{domain}</span>
              <button
                type="button"
                className="rounded-sm text-muted hover:text-default focus:outline-none focus:ring-2 focus:ring-emphasis"
                aria-label={t("remove_embed_allowed_domain", { domain })}
                onClick={(): void => removeDomain(index)}>
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
          <input
            id={domainInputId}
            ref={domainInputRef}
            type="text"
            value={domainInput}
            onBlur={(): void => {
              addDomainsFromInput(domainInput);
            }}
            onChange={(event: ChangeEvent<HTMLInputElement>): void => setDomainInput(event.target.value)}
            onKeyDown={handleDomainInputKeyDown}
            onPaste={handleDomainInputPaste}
            placeholder={domainInputPlaceholder}
            className="min-w-[12rem] flex-1 border-0 bg-transparent px-1 py-1.5 text-default text-sm leading-5 placeholder:text-muted focus:outline-none focus:ring-0"
          />
        </div>
        <p className="mt-2 text-subtle text-xs">{t("embed_allowed_domains_input_help")}</p>
        <p className="mt-1 text-subtle text-xs">{t("embed_allowed_domains_description")}</p>
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
