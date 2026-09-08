# Web view

[`services/web/src/app/(authed)/kanban/`](<../../../services/web/src/app/(authed)/kanban>):
`page.tsx` (server: auth + flag gate + board/permission load), `kanban-shell.tsx`
(URL `?board=<id>` state, dialogs, and the compact **board combo** ; a single
control whose name + chevron open the board switcher while an inline pen opens
the board settings ; there is no separate columns / edit-board toolbar button),
`kanban-board-view.tsx` (the `@dnd-kit` board: one `DndContext`, a vertical
`SortableContext` per column, highlight-only `onDragOver`, resolve + persist on
`onDragEnd`), the board / column dialogs, and the **card editor `Sheet`**.
Clicking a card opens `card-editor.tsx` as a **right-side panel** on desktop
(non-modal + no overlay, so the board stays visible/interactive behind it ; a
`PanelHeader` supplies the title + close X, and outside clicks are ignored so a
stray click can't drop the form) and a **full-screen** sheet on mobile (the
transform-free `full` variant + the shared `usePanelIsMobile` visual-viewport
check, so it can't blow out the iOS layout viewport). `CardEditor` keeps the
`Sheet` mounted and remounts only its inner `CardForm` (keyed by card id) when
you pick a different card, so switching cards re-seeds the fields **without**
replaying the panel's open animation / layout shift. **Column management lives on
the board, not a dialog**: each column header carries the drag grip + a `…` menu
(add card / edit / delete), and a trailing `AddColumn` slot creates new columns
inline (the old `ColumnManager` dialog was removed). The board primitives
(`BoardArea`, `BoardColumn`, `KanbanCard`) live in the package as framework-pure
React ; dnd-kit and shadcn stay in the web layer.
