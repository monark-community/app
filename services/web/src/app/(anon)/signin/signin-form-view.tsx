"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { OAuthProvider } from "@monark/auth/contracts";
import { OAuthButtons } from "@/app/(anon)/oauth-buttons";
import { AuthStepTransition } from "@/components/auth-step-transition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Local literal rather than importing from `./actions` : that module is
 *  `"use server"`, and keeping it out of this file's import graph is what
 *  lets the screenshot harness and component tests mount the view. */
export type SignInFormErrorCode = "invalidCredentials";

export type SignInFormViewProps = {
  /**
   * Social providers this deployment offers. Rendered by the view rather
   * than the page because their visibility is tied to the step : once an
   * address is entered the user has chosen the email route, and leaving
   * four other ways in on screen just competes with the one field they
   * still have to fill.
   */
  providers?: OAuthProvider[];
  onSignIn: (input: { email: string; password: string }) => void;
  pending?: boolean;
  errorCode?: SignInFormErrorCode | null;
  /** Seeds the step + email so stories and tests can render step two. */
  initialEmail?: string;
  initialStep?: "email" | "password";
  /** Clears the error when the user edits their way out of it. */
  onErrorDismissed?: () => void;
};

/**
 * Sign-in in two steps: identify, then authenticate.
 *
 * The first screen offers the social buttons and asks only for an
 * email, which makes those buttons the dominant choice rather than one
 * option among four fields. They then disappear: once an address is
 * entered the user has picked the email route, and leaving other ways in
 * on screen only competes with the one field still to fill. It is also
 * the shape you need if sign-in ever has to branch on the address (an
 * SSO domain, say).
 *
 * What it is **not** is a meaningful bot defence. Step two still posts
 * email + password to the same server action, so anything scripted can
 * skip step one entirely ; it only inconveniences a scraper that keys
 * off the form's shape.
 *
 * Two details carry most of the risk in a split form:
 *
 * - **Account enumeration.** Step one deliberately does no server call.
 *   Advancing tells the caller nothing about whether the address exists,
 *   which is the same stance `requestPasswordResetAction` takes and the
 *   reason this can't become a "no account with that email" oracle.
 * - **Password managers.** Splitting the fields is the classic way to
 *   break them. Both steps live in one `<form>`, and step two carries a
 *   hidden `autocomplete="username"` input holding the address, so the
 *   manager still sees an identity + secret pair and fills or saves the
 *   right entry. Same trick the account page's password dialog uses.
 *
 * Native validation drives step one : "Continue" is a real submit, so
 * `type="email" required` produces the browser's own message rather than
 * a hand-rolled one. The password input only exists in step two, so its
 * `required` can't block that first submit.
 */
export function SignInFormView({
  providers = [],
  onSignIn,
  pending = false,
  errorCode = null,
  initialEmail = "",
  initialStep = "email",
  onErrorDismissed,
}: SignInFormViewProps) {
  const t = useTranslations("auth.signIn");
  const [step, setStep] = useState<"email" | "password">(initialStep);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "email") {
      setStep("password");
      // Focus after paint so the freshly mounted input exists.
      requestAnimationFrame(() => passwordRef.current?.focus());
      return;
    }
    onSignIn({ email, password });
  }

  function backToEmail() {
    setStep("email");
    setPassword("");
    onErrorDismissed?.();
    requestAnimationFrame(() => emailRef.current?.focus());
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <AuthStepTransition stepKey={step}>
        {step === "email" ? (
          // Own column gap : the transition wrapper is a plain div, so
          // the form's `gap-6` no longer reaches between the divider and
          // the field.
          <div className="flex flex-col gap-6">
            <OAuthButtons providers={providers} />
            <div className="grid gap-2">
              <Label htmlFor="email">{t("labels.email")}</Label>
              {/* `autocomplete="username"` not "email" : the HTML
                spec reserves "username" for the identity field of a
                sign-in form (even when its value is an email
                address). Bitwarden + 1Password + iOS Passwords all
                key on this exact token to surface saved credentials
                on mobile. */}
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                autoFocus
                ref={emailRef}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* The identity half of the credential pair, kept in the DOM so
              password managers still see a username alongside the
              password. Not shown ; the row below is what the user reads. */}
            <input
              type="text"
              name="username"
              value={email}
              autoComplete="username"
              readOnly
              hidden
            />
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <span className="truncate text-sm" data-testid="signin-email-summary">
                {email}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={backToEmail}
                disabled={pending}
              >
                {t("changeEmail")}
              </Button>
            </div>
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password">{t("labels.password")}</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t("forgotPasswordLink")}
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                ref={passwordRef}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </div>
        )}
      </AuthStepTransition>

      {errorCode && <p className="text-sm text-destructive">{t(`errors.${errorCode}`)}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("submitting") : step === "email" ? t("continue") : t("submit")}
      </Button>
    </form>
  );
}
