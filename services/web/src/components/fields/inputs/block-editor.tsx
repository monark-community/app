"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { BlockEditorProps } from "./block-editor-impl";

export type { BlockEditorProps } from "./block-editor-impl";

// BlockNote can't render on the server (it constructs a ProseMirror view against
// the DOM), so both the editor and the read view load client-only, behind a
// layout-accurate skeleton fallback.
function EditorSkeleton({ fill }: { fill?: boolean }) {
  return (
    <div className={cn("space-y-2 py-2", fill && "h-full")} aria-hidden>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

/** The block editor (edit mode). Client-only ; see `block-editor-impl.tsx`. */
export const BlockEditor = dynamic(
  () => import("./block-editor-impl").then((m) => m.BlockEditorImpl),
  { ssr: false, loading: () => <EditorSkeleton /> },
) as ComponentType<BlockEditorProps>;

/**
 * Read-only render of block content. A non-editable BlockNote instance, so it
 * renders blocks identically to the editor (nesting, lists, links) without the
 * chrome. Empty content renders nothing.
 */
export const BlockView = dynamic(
  () =>
    import("./block-editor-impl").then((m) => {
      const Impl = m.BlockEditorImpl;
      const View = ({
        value,
        className,
      }: {
        value: BlockEditorProps["value"];
        className?: string;
      }) =>
        value.length === 0 ? null : (
          <Impl value={value} editable={false} className={cn("block-view", className)} />
        );
      View.displayName = "BlockView";
      return View;
    }),
  { ssr: false, loading: () => <EditorSkeleton /> },
) as ComponentType<{ value: BlockEditorProps["value"]; className?: string }>;
