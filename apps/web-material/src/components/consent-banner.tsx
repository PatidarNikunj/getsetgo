"use client";

import { consentCookieString, createConsent } from "@getsetgo/consent";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { consentDecided, consentSettingsOpened } from "@/store/consent-slice";
import { useAppDispatch, useAppSelector } from "@/store/store";

/** Removes Google Analytics' cookies (`_ga`, `_ga_<id>`) when analytics is withdrawn. */
function clearAnalyticsCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name?.startsWith("_ga")) continue;
    const host = location.hostname;
    for (const domain of [
      "",
      `; domain=${host}`,
      `; domain=.${host.split(".").slice(-2).join(".")}`,
    ]) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
    }
  }
}

/**
 * Cookie consent. Not a modal (it doesn't block the page); "Reject" is exactly as easy as
 * "Accept" (GDPR); analytics stays off until the visitor accepts.
 */
export function ConsentBanner() {
  const { bannerOpen, consent } = useAppSelector((s) => s.consent);
  const dispatch = useAppDispatch();
  if (!bannerOpen) return null;

  const decide = (analytics: boolean) => {
    const hadAnalytics = consent?.analytics === true;
    const next = createConsent(analytics);
    document.cookie = consentCookieString(next, { secure: location.protocol === "https:" });
    dispatch(consentDecided(next));
    if (hadAnalytics && !analytics) {
      // gtag.js can't be unloaded: drop its cookies and reload without it.
      clearAnalyticsCookies();
      location.reload();
    }
  };

  return (
    <Paper
      component="section"
      aria-labelledby="consent-title"
      elevation={8}
      square
      sx={{ position: "fixed", insetInline: 0, bottom: 0, zIndex: 1200, p: 2 }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ maxWidth: "64rem", mx: "auto", alignItems: { md: "center" } }}
      >
        <div>
          <Typography
            id="consent-title"
            variant="subtitle1"
            component="h2"
            sx={{ fontWeight: 600 }}
          >
            Cookie preferences
          </Typography>
          <Typography variant="body2" color="text.secondary">
            We’d like to use Google Analytics cookies to understand how the app is used. Error
            reports and basic performance stats are cookieless and always on. Your notes are never
            shared.
          </Typography>
        </div>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button variant="outlined" size="large" onClick={() => decide(false)}>
            Reject analytics
          </Button>
          <Button variant="contained" size="large" onClick={() => decide(true)}>
            Accept analytics
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

/** Reopens the banner so the visitor can change their mind at any time (GDPR art. 7(3)). */
export function CookieSettingsButton() {
  const dispatch = useAppDispatch();
  return (
    <Button size="large" onClick={() => dispatch(consentSettingsOpened())}>
      Cookie settings
    </Button>
  );
}
