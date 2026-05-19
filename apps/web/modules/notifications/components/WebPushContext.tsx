"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";
import type { Context, ReactElement, ReactNode } from "react";
import { createContext, useEffect, useMemo, useState } from "react";

const INVALID_VAPID_PUBLIC_KEY_ERROR = "Invalid VAPID public key";

interface WebPushContextProps {
  permission: NotificationPermission;
  isLoading: boolean;
  isSubscribed: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

const WebPushContext: Context<WebPushContextProps | null> = createContext<WebPushContextProps | null>(null);

interface ProviderProps {
  children: ReactNode;
}

function WebPushProvider({ children }: ProviderProps): ReactElement {
  const { t } = useLocale();
  const [permission, setPermission] = useState<NotificationPermission>(getInitialNotificationPermission);
  const [pushManager, setPushManager] = useState<PushManager | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const { mutate: addSubscription } =
    trpc.viewer.loggedInViewerRouter.addNotificationsSubscription.useMutation();
  const { mutate: removeSubscription } =
    trpc.viewer.loggedInViewerRouter.removeNotificationsSubscription.useMutation();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/service-worker.js")
      .then(async (registration) => {
        if ("pushManager" in registration) {
          setPushManager(registration.pushManager);
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        }
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  }, []);

  const contextValue = useMemo(
    () => ({
      permission,
      isLoading,
      isSubscribed,
      subscribe: async () => {
        try {
          setIsLoading(true);
          const newPermission = await Notification.requestPermission();
          setPermission(newPermission);

          if (newPermission === "granted" && pushManager) {
            const vapidPublicKey = await getVapidPublicKey();
            const subscription = await pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlB64ToUint8Array(vapidPublicKey),
            });
            addSubscription({ subscription: JSON.stringify(subscription) });
            setIsSubscribed(true);
            showToast(t("browser_notifications_turned_on"), "success");
          }
        } catch (error) {
          console.error("Failed to subscribe:", error);
          if (isInvalidVapidPublicKeyError(error)) {
            showToast(t("push_notifications_public_key_invalid"), "error");
          } else {
            showToast(t("failed_to_enable_notifications"), "error");
          }
        } finally {
          setIsLoading(false);
        }
      },
      unsubscribe: async () => {
        if (!pushManager) return;
        try {
          setIsLoading(true);
          const subscription = await pushManager.getSubscription();
          if (subscription) {
            const subscriptionJson = JSON.stringify(subscription);
            await subscription.unsubscribe();
            removeSubscription({ subscription: subscriptionJson });
            setIsSubscribed(false);
            showToast(t("browser_notifications_turned_off"), "success");
          }
        } catch (error) {
          console.error("Failed to unsubscribe:", error);
          showToast(t("failed_to_disable_notifications"), "error");
        } finally {
          setIsLoading(false);
        }
      },
    }),
    [permission, isLoading, isSubscribed, pushManager, addSubscription, removeSubscription, t]
  );

  return <WebPushContext.Provider value={contextValue}>{children}</WebPushContext.Provider>;
}

const getInitialNotificationPermission = (): NotificationPermission => {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";

  return Notification.permission;
};

const urlB64ToUint8Array = (base64String: string): Uint8Array<ArrayBuffer> => {
  const trimmedBase64String = base64String.trim();
  if (!trimmedBase64String) {
    throw new Error(INVALID_VAPID_PUBLIC_KEY_ERROR);
  }

  const padding = "=".repeat((4 - (trimmedBase64String.length % 4)) % 4);
  const base64 = (trimmedBase64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  let rawData = "";

  try {
    rawData = window.atob(base64);
  } catch {
    throw new Error(INVALID_VAPID_PUBLIC_KEY_ERROR);
  }

  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  if (outputArray.length !== 65 || outputArray[0] !== 4) {
    throw new Error(INVALID_VAPID_PUBLIC_KEY_ERROR);
  }

  return outputArray;
};

const getVapidPublicKey = async (): Promise<string> => {
  const response = await fetch("/api/notifications/vapid-public-key", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(INVALID_VAPID_PUBLIC_KEY_ERROR);
  }

  const data: unknown = await response.json();
  if (!isRecord(data) || typeof data.publicKey !== "string") {
    throw new Error(INVALID_VAPID_PUBLIC_KEY_ERROR);
  }

  return data.publicKey;
};

const isInvalidVapidPublicKeyError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  return (
    error.message.includes(INVALID_VAPID_PUBLIC_KEY_ERROR) ||
    error.message.includes("applicationServerKey") ||
    error.message.includes("VAPID public key")
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export { WebPushContext, WebPushProvider };
