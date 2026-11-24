import { CONSENT_COOKIE } from "@getsetgo/consent";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ConsentProvider } from "@/stores/consent-store";

import { ConsentBanner, CookieSettingsButton } from "./consent-banner";

const renderBanner = () =>
  render(
    <ConsentProvider initial={null}>
      <ConsentBanner />
      <CookieSettingsButton />
    </ConsentProvider>,
  );

describe("ConsentBanner", () => {
  afterEach(() => {
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  });

  it("is a labelled region with equally easy Accept and Reject", () => {
    renderBanner();
    expect(screen.getByRole("region", { name: "Cookie preferences" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept analytics" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject analytics" })).toBeEnabled();
  });

  it("stores the choice in the consent cookie and closes; Cookie settings reopens it", async () => {
    renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Accept analytics" }));

    expect(document.cookie).toMatch(/gsg_consent=1\.a1\./);
    expect(screen.queryByRole("region", { name: "Cookie preferences" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cookie settings" }));
    expect(screen.getByRole("region", { name: "Cookie preferences" })).toBeInTheDocument();
  });
});
