# 2.6 Frontend shell

Mounted once in `app/(authed)/layout.tsx`: a persistent desktop **NavRail** (slim icon rail, `md+`) + a mobile hamburger `Sheet` drawer, both driven by the single `usePrimaryNav()` resolver (`config/primary-nav.ts` + flag filtering + an admin pin when `rbac.isAdmin`). A sticky `AppBar` carries breadcrumb + global search (⌘K), the notifications bell, and the user menu. Section-level secondary nav uses `SecondaryTabsBar` / `sidebar-rail`. Recurring list/detail screens compose from the app-local **patterns** library (`components/patterns`: `DataTable`, `FilterBar`, `TableDetailLayout` + `useDetailPanelRoute`, `DirtyFormBar`, `ConfirmDialog`, `ListMobileBar`, `CreateFab`, …). Schema-driven forms + table cells come from the **fields toolkit** (`components/fields`, a `FieldDef` registry the Data Models engine plugs into). Every meaningful async surface ships a layout-accurate `Skeleton`.

---
