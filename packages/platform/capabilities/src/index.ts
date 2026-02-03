export interface ClipboardCapability {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

export interface FileSystemCapability {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
}

export interface TrayCapability {
  setBadge(text: string | null): Promise<void>;
}

export interface NotificationsCapability {
  notify(title: string, body: string): Promise<void>;
}

export interface PlatformCapabilities {
  clipboard: ClipboardCapability;
  filesystem: FileSystemCapability;
  tray: TrayCapability;
  notifications: NotificationsCapability;
}

const notSupported = (name: string) => async () => {
  throw new Error(`${name} not supported on this platform`);
};

export function createNotSupportedCapabilities(): PlatformCapabilities {
  return {
    clipboard: {
      readText: notSupported("clipboard.readText"),
      writeText: notSupported("clipboard.writeText"),
    },
    filesystem: {
      readTextFile: notSupported("filesystem.readTextFile"),
      writeTextFile: notSupported("filesystem.writeTextFile"),
    },
    tray: {
      setBadge: notSupported("tray.setBadge"),
    },
    notifications: {
      notify: notSupported("notifications.notify"),
    },
  };
}
