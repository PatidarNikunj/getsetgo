/** reCAPTCHA v3 (invisible). Loaded only on the sign-in page, only when a site key is set. */
declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

export const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || undefined;

export const recaptchaScriptSrc = (siteKey: string) =>
  `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;

/** Resolves with a token for the "sign_in" action (the API checks the action and score). */
export function recaptchaToken(siteKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const grecaptcha = window.grecaptcha;
    if (!grecaptcha) {
      reject(new Error("reCAPTCHA not loaded"));
      return;
    }
    grecaptcha.ready(() => {
      grecaptcha.execute(siteKey, { action: "sign_in" }).then(resolve, reject);
    });
  });
}
