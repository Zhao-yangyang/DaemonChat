"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@daemon/ui";
import { useTheme } from "@/src/hooks/use-theme";

const icons: Record<string, React.ElementType> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const next: Record<string, "light" | "dark" | "system"> = {
  light: "dark",
  dark: "system",
  system: "light",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = icons[theme] ?? Monitor;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(next[theme] ?? "light")}
      title={`当前：${theme}`}
    >
      <Icon className="size-4" />
      <span className="sr-only">切换主题</span>
    </Button>
  );
}
