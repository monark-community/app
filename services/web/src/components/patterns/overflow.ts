/**
 * How many fixed-width items fit in `budget` px before the rest must
 * collapse into an overflow ("…") trigger. When not everything fits, one
 * item slot is reserved for the trigger itself. Shared by `PanelHeader`
 * (icon actions) and `TableTools` (toolbar controls).
 */
export function fitVisibleCount(
  budget: number,
  itemWidth: number,
  total: number,
  max: number = total,
): number {
  let fit = Math.floor(budget / itemWidth);
  fit = Math.min(fit, total, max);
  if (fit < total) {
    fit = Math.floor((budget - itemWidth) / itemWidth);
    fit = Math.min(fit, total, max);
  }
  return Math.max(0, fit);
}
