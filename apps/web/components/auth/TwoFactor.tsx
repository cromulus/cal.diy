import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Input, Label } from "@calcom/ui/components/form";
import React, { useEffect, useState } from "react";
import useDigitInput from "react-digit-input";
import { useFormContext } from "react-hook-form";

export default function TwoFactor({ center = true, autoFocus = true }) {
  const [value, onChange] = useState("");
  const { t } = useLocale();
  const methods = useFormContext();

  const digits = useDigitInput({
    acceptedCharacters: /^[0-9]$/,
    length: 6,
    value,
    onChange,
  });

  useEffect(() => {
    methods.register("totpCode");
  }, [methods]);

  useEffect(() => {
    methods.setValue("totpCode", value, { shouldDirty: true, shouldValidate: true });
  }, [methods, value]);

  const className = "h-12 w-12 text-xl! text-center";

  return (
    <div className={center ? "mx-auto mt-0! max-w-sm" : "mt-0! max-w-sm"}>
      <Label className="mt-4">{t("2fa_code")}</Label>

      <p className="text-subtle mb-4 text-sm">{t("2fa_enabled_instructions")}</p>

      <div className="flex flex-row justify-between">
        {digits.map((digit, index) => (
          <Input
            key={`2fa${index}`}
            id={index === 0 ? "totpCode" : `totpCode-${index + 1}`}
            className={className}
            {...digit}
            name={index === 0 ? "totpCode" : `totpCode-${index + 1}`}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={index === 0 ? 6 : 1}
            autoFocus={autoFocus && index === 0}
            autoComplete={index === 0 ? "one-time-code" : "off"}
            enterKeyHint="done"
            aria-label={index === 0 ? t("2fa_code") : `${t("2fa_code")} ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
