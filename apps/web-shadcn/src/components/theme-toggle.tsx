"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type ThemePreference, useUiStore } from "@/stores/ui-store";

const options: { value: ThemePreference; label: string; Icon: typeof SunIcon }[] = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

/** Three toggle buttons; aria-pressed tells screen readers which theme is active. */
export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <div role="group" aria-label="Color theme" className="flex gap-1">
      {options.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          size="icon-lg"
          variant={theme === value ? "secondary" : "ghost"}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </Button>
      ))}
    </div>
  );
}
