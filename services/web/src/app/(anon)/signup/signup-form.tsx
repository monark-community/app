"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { checkPasswordOffline } from "@monark/auth/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";
import { signUpAction, type SignUpErrorCode } from "./actions";

export function SignUpForm() {
  const t = useTranslations("auth.signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errorCode, setErrorCode] = useState<SignUpErrorCode | null>(null);
  const [isPending, startTransition] = useTransition();

  const strength = useMemo(
    () =>
      checkPasswordOffline(password, {
        email: email || undefined,
        displayName: displayName || undefined,
      }),
    [password, email, displayName],
  );

  function onSubmit(formData: FormData) {
    setErrorCode(null);
    startTransition(async () => {
      const result = await signUpAction({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        displayName: String(formData.get("displayName") ?? "") || undefined,
      });
      if (result && !result.ok) setErrorCode(result.errorCode);
    });
  }

  return (
    <Card className="shadow-none border-border">
      <CardContent className="pt-6">
        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">{t("labels.email")}</Label>
            {/* "username" not "email" : the spec reserves "username"
                for the identity field of a sign-in / sign-up form so
                password managers can save the right credential pair.
                Pairs with `new-password` on the password input below. */}
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">{t("labels.password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordStrengthMeter score={strength.score} visible={password.length > 0} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="displayName">{t("labels.displayName")}</Label>
            <Input
              id="displayName"
              name="displayName"
              type="text"
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {errorCode && <p className="text-sm text-destructive">{t(`errors.${errorCode}`)}</p>}

          <Button type="submit" disabled={isPending || !strength.ok} className="w-full">
            {isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
