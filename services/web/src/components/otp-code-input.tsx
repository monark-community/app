"use client";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";

/**
 * Standard 6-digit authenticator (TOTP) code entry: two groups of three
 * slots. Every TOTP surface in the app uses this so they look and behave
 * identically.
 *
 * Pass `onComplete` to validate **instantly** the moment the sixth digit
 * lands — typed or pasted — so the user never has to reach for a button.
 * Wire it to the same verify/submit action the button triggers, and guard
 * against re-entry while a request is in flight (see call sites).
 */
export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  id,
  disabled,
  autoFocus = true,
  containerClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fires with the full value once all six digits are entered. */
  onComplete?: (value: string) => void;
  id?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  containerClassName?: string;
}) {
  return (
    <InputOTP
      id={id}
      maxLength={6}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      containerClassName={containerClassName}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  );
}
