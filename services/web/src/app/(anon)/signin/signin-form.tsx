"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { signInAction, type SignInErrorCode } from "./actions";

export function SignInForm() {
  const t = useTranslations("auth.signIn");
  const [errorCode, setErrorCode] = useState<SignInErrorCode | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setErrorCode(null);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    startTransition(async () => {
      const result = await signInAction({ email, password });
      if (result && !result.ok) setErrorCode(result.errorCode);
    });
  }

  return (
    <Card className="shadow-none border-border">
      <CardContent className="pt-6">
        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">{t("labels.email")}</Label>
            {/* `autocomplete="username"` not "email" : the HTML
                spec reserves "username" for the identity field of a
                sign-in form (even when its value is an email
                address). Bitwarden + 1Password + iOS Passwords all
                key on this exact token to surface saved credentials
                on mobile. */}
            <Input id="email" name="email" type="email" required autoComplete="username" />
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
            />
          </div>
          {errorCode && <p className="text-sm text-destructive">{t(`errors.${errorCode}`)}</p>}
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
