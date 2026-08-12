"use client";

/**
 * Dev-only smoke page for the BlockNote block editor. Renders a live
 * `BlockEditor` with local state, a read-only `BlockView` of the same content,
 * and the derived plain text + raw block JSON, so the editor can be exercised by
 * hand (slash menu, drag handles, nesting) and validated in both themes. Not
 * linked in navigation ; copy here is inline dev scaffolding, not product text.
 */

import { useState } from "react";
import type { Block } from "@blocknote/core";
import { blocksToText } from "@monark/common/blocks";
import { BlockEditor, BlockView } from "@/components/fields/inputs/block-editor";

export default function BlockEditorDevPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 p-6 lg:grid-cols-2">
      <section className="min-w-0 space-y-6">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Block editor</h1>
          <p className="text-sm text-muted-foreground">
            BlockNote. Type &quot;/&quot; for the slash menu ; drag the handle to reorder ; Tab to
            nest.
          </p>
        </div>
        <div className="rounded-md border">
          <BlockEditor value={blocks} onChange={setBlocks} placeholder="Type '/' for commands…" />
        </div>

        <div>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Read-only view</h2>
          <div className="rounded-md border p-2">
            <BlockView value={blocks} />
          </div>
        </div>
      </section>

      <section className="min-w-0 space-y-6">
        <div>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Derived plain text</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            From <code>blocksToText</code> ; this is what title-derivation, search, and previews
            use.
          </p>
          <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
            {blocksToText(blocks) || "(empty)"}
          </pre>
        </div>
        <div>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Stored JSON</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            The block array persisted to the database.
          </p>
          <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
            {JSON.stringify(blocks, null, 2)}
          </pre>
        </div>
      </section>
    </div>
  );
}
