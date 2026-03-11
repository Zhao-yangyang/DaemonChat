import { createNotSupportedCapabilities } from "@daemon/platform-capabilities";
import type { PlatformCapabilities } from "@daemon/platform-capabilities";

export function createPlatformCapabilities(): PlatformCapabilities {
  const notSupported = createNotSupportedCapabilities();

  return {
    clipboard: {
      readText: async (): Promise<string> => {
        if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
          return navigator.clipboard.readText();
        }
        throw new Error("clipboard.readText not supported in this environment");
      },
      writeText: async (text: string): Promise<void> => {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          return navigator.clipboard.writeText(text);
        }
        // Fallback: execCommand (deprecated but wide support)
        if (typeof document !== "undefined") {
          const el = document.createElement("textarea");
          el.value = text;
          el.style.position = "fixed";
          el.style.opacity = "0";
          document.body.appendChild(el);
          el.focus();
          el.select();
          document.execCommand("copy");
          document.body.removeChild(el);
          return;
        }
        throw new Error("clipboard.writeText not supported in this environment");
      },
    },

    // Browser has no writable filesystem — keep notSupported
    filesystem: notSupported.filesystem,

    // Browser has no system tray — keep notSupported
    tray: notSupported.tray,

    notifications: {
      notify: async (title: string, body: string): Promise<void> => {
        if (typeof window === "undefined" || !("Notification" in window)) {
          throw new Error("notifications.notify not supported in this environment");
        }
        if (Notification.permission === "granted") {
          new Notification(title, { body });
          return;
        }
        if (Notification.permission === "denied") {
          throw new Error("Notification permission denied");
        }
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          new Notification(title, { body });
        } else {
          throw new Error("Notification permission not granted");
        }
      },
    },
  };
}
