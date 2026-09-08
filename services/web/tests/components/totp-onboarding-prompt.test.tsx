import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl, screen, userEvent } from "../test-utils";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

/**
 * Stands in for the react-query cache. The component's whole correctness
 * argument is that visibility comes from the *cache* rather than from
 * component-local state, so the mock has to model the one property that
 * matters: `setData` writes somewhere that a remount can still read.
 *
 * That's what the regression test below leans on. The original bug was
 * `query && !localState` — dismissing set a `useState` flag, and because
 * this component is mounted in the (authed) layout, any client-side
 * navigation remounted it with the flag back at `false` while the cache
 * still said `shouldPrompt: true`. The modal reopened.
 */
let cache: { shouldPrompt: boolean } | undefined;
const mockMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      totp: {
        onboardingStatus: { useQuery: () => ({ data: cache }) },
        dismissOnboarding: {
          useMutation: () => ({
            mutate: (input: undefined, opts?: { onError?: () => void }) => mockMutate(input, opts),
            isPending: false,
          }),
        },
      },
    },
    useUtils: () => ({
      auth: {
        totp: {
          onboardingStatus: {
            setData: (_input: undefined, next: { shouldPrompt: boolean }) => {
              cache = next;
            },
            invalidate: mockInvalidate,
          },
        },
      },
    }),
  },
}));

import { TotpOnboardingPrompt } from "@/components/totp-onboarding-prompt";

function dialog() {
  return screen.queryByRole("dialog");
}

beforeEach(() => {
  cache = { shouldPrompt: true };
  mockMutate.mockReset();
  mockInvalidate.mockReset();
  mockPush.mockReset();
});

describe("<TotpOnboardingPrompt>", () => {
  it("prompts when the server says to", () => {
    renderWithIntl(<TotpOnboardingPrompt />);
    expect(dialog()).toBeInTheDocument();
    expect(screen.getByText(/protect your account/i)).toBeInTheDocument();
  });

  it("stays away when the server says not to", () => {
    cache = { shouldPrompt: false };
    renderWithIntl(<TotpOnboardingPrompt />);
    expect(dialog()).not.toBeInTheDocument();
  });

  it("renders nothing while the status is still loading", () => {
    cache = undefined;
    renderWithIntl(<TotpOnboardingPrompt />);
    expect(dialog()).not.toBeInTheDocument();
  });

  it("records the decision on 'Not now'", async () => {
    const user = userEvent.setup();
    renderWithIntl(<TotpOnboardingPrompt />);

    await user.click(screen.getByRole("button", { name: /not now/i }));

    // Both halves matter : the cache write is what closes the modal and
    // survives a remount, the mutation is what makes it permanent.
    expect(cache).toEqual({ shouldPrompt: false });
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("does not reopen after a remount once dismissed", async () => {
    // The actual regression. Dismiss, throw the component away as a
    // client-side navigation would, and mount it fresh.
    const user = userEvent.setup();
    const first = renderWithIntl(<TotpOnboardingPrompt />);
    await user.click(screen.getByRole("button", { name: /not now/i }));
    first.unmount();

    renderWithIntl(<TotpOnboardingPrompt />);

    expect(dialog()).not.toBeInTheDocument();
  });

  it("puts the question back when persisting the dismissal fails", async () => {
    const user = userEvent.setup();
    renderWithIntl(<TotpOnboardingPrompt />);

    await user.click(screen.getByRole("button", { name: /not now/i }));
    // Drive the mutation's error path the way react-query would.
    const opts = mockMutate.mock.calls[0]?.[1] as { onError?: () => void } | undefined;
    opts?.onError?.();

    // A decision that never reached the database shouldn't be treated as
    // made ; invalidating lets the server re-answer.
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it("routes to the security page on 'Set up two-factor' without persisting", async () => {
    const user = userEvent.setup();
    renderWithIntl(<TotpOnboardingPrompt />);

    await user.click(screen.getByRole("button", { name: /set up two-factor/i }));

    expect(mockPush).toHaveBeenCalledWith("/account/security?enroll=totp");
    // Cache-only suppression : the modal goes away for this session, but
    // nothing is written, so an abandoned enrollment gets asked again.
    expect(cache).toEqual({ shouldPrompt: false });
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("treats an Escape dismissal the same as 'Not now'", async () => {
    const user = userEvent.setup();
    renderWithIntl(<TotpOnboardingPrompt />);

    await user.keyboard("{Escape}");

    expect(cache).toEqual({ shouldPrompt: false });
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
