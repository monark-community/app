import { redirect } from "next/navigation";
import { DATA_TABS } from "./data-tabs";

// `/data` is the section entry point ; there's no separate Data
// dashboard, so forward straight to the *first* model in the sidebar
// (today: Projects). Read from the shared `DATA_TABS` array so
// reordering the sidebar automatically retargets `/data`. The moved
// model's own route layout gates `<model>.read`, so a user lacking it
// is bounced to `/` on the next hop.
export default function DataHomePage() {
  redirect(DATA_TABS[0]!.href);
}
