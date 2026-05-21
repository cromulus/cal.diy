"use client";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

export function useRedirectToLoginIfUnauthenticated(isPublic = false) {
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastReplaceTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPublic) {
      return;
    }

    if (!loading && !session) {
      const currentSearch = searchParams?.toString();
      let currentPath = pathname ?? location.pathname;
      if (currentSearch) {
        currentPath = `${currentPath}?${currentSearch}`;
      }
      if (currentPath.startsWith("/auth/login")) {
        return;
      }
      const urlSearchParams = new URLSearchParams();
      urlSearchParams.set("callbackUrl", `${WEBAPP_URL}${currentPath}`);
      const target = `/auth/login?${urlSearchParams.toString()}`;
      if (currentPath === target || lastReplaceTargetRef.current === target) {
        return;
      }
      lastReplaceTargetRef.current = target;
      router.replace(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, isPublic, pathname, searchParams, router]);

  return {
    loading: loading && !session,
    session,
  };
}
