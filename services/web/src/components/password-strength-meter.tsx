"use client"

import { useTranslations } from "next-intl"

type Score = 0 | 1 | 2 | 3 | 4

const SEGMENT_COLOR: Record<Score, string> = {
  0: "bg-destructive/60",
  1: "bg-destructive/80",
  2: "bg-chart-3",
  3: "bg-chart-4",
  4: "bg-primary",
}

export function PasswordStrengthMeter({
  score,
  visible,
}: {
  score: Score
  visible: boolean
}) {
  const t = useTranslations("auth.passwordStrength")
  if (!visible) return null

  const activeColor = SEGMENT_COLOR[score]
  const filled = Math.max(1, score + 1)
  const level = t(`levels.${score}`)

  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < filled ? activeColor : "bg-border"}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t.rich("label", {
          level,
          strong: (chunks) => <span className="text-foreground">{chunks}</span>,
        })}
      </p>
    </div>
  )
}
