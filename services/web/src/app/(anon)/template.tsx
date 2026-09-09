import type { ReactNode } from "react";

/**
 * Fades each auth screen in on arrival, so moving between sign-in,
 * sign-up and forgot-password reads as one surface changing rather than
 * a hard cut.
 *
 * A `template` rather than a `layout` on purpose: Next remounts a
 * template on every navigation within the group, which is what gives the
 * animation something to trigger on. A layout persists, so it would run
 * once and never again.
 *
 * What this is not: a true crossfade. The outgoing screen is gone before
 * the incoming one mounts, so there is no fade *out*, and the card is a
 * fresh element each time rather than one box that morphs. Keeping a
 * single card mounted across routes would mean hoisting `AuthScreen`
 * into a shared layout and unifying the `(anon)` and `/auth/*` route
 * groups, since both render their own copy today. The in-card step
 * transition on the sign-in form is the real thing ; this is the cheap
 * approximation between routes.
 *
 * The aurora backdrop lives inside `AuthScreen` and so is part of what
 * fades. That reads fine because every auth screen paints the same
 * backdrop in the same place: the visible change is the card, not the
 * background.
 *
 * `motion-reduce:` drops the animation for anyone who has asked for less
 * of it ; the content still arrives, just without the fade.
 */
export default function AnonTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="animate-in fade-in duration-300 ease-out motion-reduce:animate-none">
      {children}
    </div>
  );
}
