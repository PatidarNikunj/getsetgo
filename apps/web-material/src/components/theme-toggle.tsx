"use client";

import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import ComputerIcon from "@mui/icons-material/SettingsBrightnessOutlined";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "@/store/store";
import { type ThemePreference, themeChanged } from "@/store/ui-slice";

const STORAGE_KEY = "gsg-theme";
const options = [
  { value: "system", label: "System", Icon: ComputerIcon },
  { value: "light", label: "Light", Icon: LightModeIcon },
  { value: "dark", label: "Dark", Icon: DarkModeIcon },
] as const;

/** Theme choice lives in Redux and is remembered in localStorage. */
export function ThemeToggle() {
  const theme = useAppSelector((s) => s.ui.theme);
  const dispatch = useAppDispatch();

  // Restore the saved choice after hydration (the server can't know it).
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") dispatch(themeChanged(saved));
  }, [dispatch]);

  const change = (value: ThemePreference | null) => {
    if (!value) return;
    localStorage.setItem(STORAGE_KEY, value);
    dispatch(themeChanged(value));
  };

  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={theme}
      onChange={(_e, value: ThemePreference | null) => change(value)}
      aria-label="Color theme"
    >
      {options.map(({ value, label, Icon }) => (
        <Tooltip key={value} title={label}>
          <ToggleButton value={value} aria-label={label}>
            <Icon fontSize="small" aria-hidden="true" />
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}
