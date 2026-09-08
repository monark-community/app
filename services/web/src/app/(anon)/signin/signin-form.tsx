"use client";

import { useState, useTransition } from "react";
import type { OAuthProvider } from "@monark/auth/contracts";
import { signInAction, type SignInErrorCode } from "./actions";
import { SignInFormView } from "./signin-form-view";

/**
 * Wires the two-step sign-in form to its server action. The form itself
 * lives in [`SignInFormView`](./signin-form-view.tsx), which has no
 * server-action import so the screenshot harness and component tests can
 * mount it.
 */
export function SignInForm({ providers }: { providers: OAuthProvider[] }) {
  const [errorCode, setErrorCode] = useState<SignInErrorCode | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSignIn(input: { email: string; password: string }) {
    setErrorCode(null);
    startTransition(async () => {
      // A successful sign-in redirects server-side, so `result` is only
      // ever populated on failure.
      const result = await signInAction(input);
      if (result && !result.ok) setErrorCode(result.errorCode);
    });
  }

  return (
    <SignInFormView
      providers={providers}
      onSignIn={onSignIn}
      pending={isPending}
      errorCode={errorCode}
      onErrorDismissed={() => setErrorCode(null)}
    />
  );
}
