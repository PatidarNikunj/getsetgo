import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SignInButtons } from "./sign-in-buttons";

// next/script needs the Next.js runtime; reCAPTCHA is off in tests anyway (no site key).
vi.mock("next/script", () => ({ default: () => null }));

describe("SignInButtons", () => {
  it("renders one native POST form per provider, with the shared accessible names", () => {
    render(<SignInButtons providers={["google", "github", "test"]} returnTo="/account" />);

    for (const [name, provider] of [
      ["Continue with Google", "google"],
      ["Continue with GitHub", "github"],
      ["Continue with test provider", "test"],
    ] as const) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("type", "submit");
      const form = button.closest("form");
      expect(form).toHaveAttribute("method", "post");
      expect(form).toHaveAttribute("action", `/api/auth/${provider}/start`);
      expect(form?.querySelector('input[name="returnTo"]')).toHaveValue("/account");
    }
  });

  it("only shows the configured providers", () => {
    render(<SignInButtons providers={["github"]} returnTo="/" />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  });
});
