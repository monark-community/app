"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { FilterOp } from "@monark/query/contracts";

/**
 * Localized autocomplete `detail` hints for the shared {@link QueryBar} —
 * operator meanings (`>` → "greater than") and `@variable` descriptions. These
 * are generic MQL concepts (identical on every surface), so they live in one
 * shared `query.*` namespace ; spread the result into `<QueryBar {...} />`.
 * Omitting them falls back to `@monark/query`'s English defaults.
 */
export function useMqlLabels(): {
  describeOp: (op: FilterOp) => string;
  describeVariable: (token: string) => string;
} {
  const t = useTranslations("query");
  const describeOp = useCallback((op: FilterOp) => t(`op.${op}`), [t]);
  const describeVariable = useCallback((token: string) => t(`var.${token.replace(/^@/, "")}`), [t]);
  return useMemo(() => ({ describeOp, describeVariable }), [describeOp, describeVariable]);
}
