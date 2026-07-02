import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Two-letter initials for an avatar fallback (first + last word). */
export function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Small avatar for relation options / chips / cells : the image when a
 * `src` is given, otherwise initials derived from the label. Sized for
 * inline use next to a label (defaults to `h-6 w-6`).
 */
export function FieldAvatar({
  label,
  src,
  className,
}: {
  label: string;
  src?: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("h-6 w-6 shrink-0", className)}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className="text-[10px] font-medium">{initials(label)}</AvatarFallback>
    </Avatar>
  );
}
