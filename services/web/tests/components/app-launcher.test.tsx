import { describe, expect, it, vi } from "vitest";
import { Boxes } from "lucide-react";

// Override the APPS registry for this suite. Default `apps.ts`
// only declares Monark Core ; we add a synthetic external entry to
// exercise the external-link affordances.
vi.mock("@/config/apps", () => ({
  APPS: [
    {
      id: "core",
      href: "/",
      external: false,
      current: true,
      icon: Boxes,
    },
    {
      id: "ledgerLift",
      href: "https://ledgerlift.example.com",
      external: true,
      current: false,
      icon: Boxes,
    },
  ],
}));

import { renderWithIntl, screen, userEvent } from "../test-utils";
import { AppLauncher } from "@/components/app-launcher";

// `useTranslations("appBar.apps.items")` reads from the en messages.
// We add a synthetic `ledgerLift.{name,tagline}` entry to the
// catalog at runtime — `next-intl` reads the messages object the
// provider passes, so updating it before render is sufficient.
import enMessages from "@/messages/en.json";
(enMessages.appBar.apps.items as Record<string, unknown>).ledgerLift = {
  name: "LedgerLift",
  tagline: "Token-gated ledger",
};

describe("<AppLauncher>", () => {
  it("renders the trigger button with the right aria-label", () => {
    renderWithIntl(<AppLauncher />);
    // The translation key `appBar.apps.triggerAria` resolves to
    // "Switch app" (en).
    expect(screen.getByRole("button", { name: /switch app/i })).toBeInTheDocument();
  });

  it("opens the drawer + lists every registered app card on click", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AppLauncher />);
    await user.click(screen.getByRole("button", { name: /switch app/i }));
    // Each app's name shows up in a card.
    expect(screen.getByText("Monark Core")).toBeInTheDocument();
    expect(screen.getByText("LedgerLift")).toBeInTheDocument();
  });

  it("renders a 'No app registered' empty-slot card after the registered ones", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AppLauncher />);
    await user.click(screen.getByRole("button", { name: /switch app/i }));
    expect(screen.getByText(/no app registered/i)).toBeInTheDocument();
  });

  it("marks the current app with a 'Current' pill", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AppLauncher />);
    await user.click(screen.getByRole("button", { name: /switch app/i }));
    // The "Current" badge text comes from `appBar.apps.currentBadge`.
    expect(screen.getByText(/^current$/i)).toBeInTheDocument();
  });

  it("opens external app links in a new tab + keeps internal links same-tab", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AppLauncher />);
    await user.click(screen.getByRole("button", { name: /switch app/i }));
    const ledgerLink = screen.getByText("LedgerLift").closest("a");
    expect(ledgerLink).toBeTruthy();
    expect(ledgerLink?.getAttribute("target")).toBe("_blank");
    expect(ledgerLink?.getAttribute("rel")).toBe("noopener noreferrer");
    const coreLink = screen.getByText("Monark Core").closest("a");
    expect(coreLink?.getAttribute("target")).toBeNull();
  });

  it("marks the current card with aria-current=true", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AppLauncher />);
    await user.click(screen.getByRole("button", { name: /switch app/i }));
    const coreLink = screen.getByText("Monark Core").closest("a");
    expect(coreLink?.getAttribute("aria-current")).toBe("true");
    const ledgerLink = screen.getByText("LedgerLift").closest("a");
    expect(ledgerLink?.getAttribute("aria-current")).toBeNull();
  });

  it("renders the title + subtitle in the drawer header", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AppLauncher />);
    await user.click(screen.getByRole("button", { name: /switch app/i }));
    // `appBar.apps.title` = "Monark apps" ; subtitle gets rendered
    // below the heading.
    // SheetTitle renders an sr-only h2 + the component renders a visible h2.
    const headings = screen.getAllByRole("heading", { name: /monark apps/i });
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/switch between monark products/i)).toBeInTheDocument();
  });
});
