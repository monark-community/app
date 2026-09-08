import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl, screen, userEvent, waitFor } from "../test-utils";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// The buttons redirect through Supabase ; the view only decides whether
// they're on screen, which is all these tests care about.
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signInWithOAuth: vi.fn().mockResolvedValue({ error: null }) },
  }),
}));

import { SignInFormView } from "@/app/(anon)/signin/signin-form-view";

const onSignIn = vi.fn();
const onErrorDismissed = vi.fn();

beforeEach(() => {
  onSignIn.mockReset();
  onErrorDismissed.mockReset();
});

const emailInput = () => screen.getByLabelText(/email/i);
const passwordInput = () => screen.queryByLabelText(/password/i);
/** Step two mounts behind a short crossfade, so its fields are awaited. */
const awaitPasswordStep = () => screen.findByLabelText(/password/i);

async function goToPasswordStep(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(emailInput(), email);
  await user.click(screen.getByRole("button", { name: /^continue$/i }));
  await awaitPasswordStep();
}

describe("<SignInFormView>", () => {
  it("asks for an email first, and nothing else", () => {
    renderWithIntl(<SignInFormView onSignIn={onSignIn} />);

    expect(emailInput()).toBeInTheDocument();
    // The point of the split : the password field isn't on the first
    // screen at all, so its `required` can't block that first submit.
    expect(passwordInput()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^continue$/i })).toBeInTheDocument();
  });

  it("advances to the password step without calling the server", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SignInFormView onSignIn={onSignIn} />);

    await goToPasswordStep(user, "ada@example.com");

    // Step one is deliberately local : reaching step two must reveal
    // nothing about whether the account exists.
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("drops the social buttons once an address is entered", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SignInFormView onSignIn={onSignIn} providers={["github", "google"]} />);

    expect(screen.getByRole("button", { name: /continue with github/i })).toBeInTheDocument();

    await goToPasswordStep(user, "ada@example.com");

    // The user has picked the email route ; other ways in would only
    // compete with the one field left to fill.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /continue with github/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /continue with google/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows the address it's about to sign in with", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SignInFormView onSignIn={onSignIn} />);

    await goToPasswordStep(user, "ada@example.com");

    expect(screen.getByTestId("signin-email-summary")).toHaveTextContent("ada@example.com");
  });

  it("keeps a username field in the DOM so password managers still pair the credential", async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(<SignInFormView onSignIn={onSignIn} />);

    await goToPasswordStep(user, "ada@example.com");

    // Splitting the fields across steps is the classic way to break
    // managers ; the hidden identity input is what prevents it.
    const username = container.querySelector<HTMLInputElement>(
      'input[autocomplete="username"][name="username"]',
    );
    expect(username).not.toBeNull();
    expect(username?.value).toBe("ada@example.com");
    expect(passwordInput()).toHaveAttribute("autocomplete", "current-password");
  });

  it("submits both halves once the password is entered", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SignInFormView onSignIn={onSignIn} />);

    await goToPasswordStep(user, "ada@example.com");
    await user.type(passwordInput()!, "correct horse battery");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(onSignIn).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "correct horse battery",
    });
  });

  it("goes back to the email step and forgets the typed password", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SignInFormView onSignIn={onSignIn} onErrorDismissed={onErrorDismissed} />);

    await goToPasswordStep(user, "ada@example.com");
    await user.type(passwordInput()!, "typed-then-abandoned");
    await user.click(screen.getByRole("button", { name: /^change$/i }));

    // Email survives so the user doesn't retype it ; the password does
    // not, so it can't be submitted for a different address.
    const backToEmail = await screen.findByLabelText(/email/i);
    expect(backToEmail).toHaveValue("ada@example.com");
    expect(onErrorDismissed).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(await awaitPasswordStep()).toHaveValue("");
  });

  it("renders a credential error on the password step", () => {
    renderWithIntl(
      <SignInFormView
        onSignIn={onSignIn}
        initialStep="password"
        initialEmail="ada@example.com"
        errorCode="invalidCredentials"
      />,
    );

    // Stays on step two rather than bouncing back to the email : the
    // thing to retry is the password.
    expect(screen.getByText(/email or password is incorrect/i)).toBeInTheDocument();
    expect(passwordInput()).toBeInTheDocument();
  });

  it("disables submit while the request is in flight", () => {
    renderWithIntl(
      <SignInFormView
        onSignIn={onSignIn}
        initialStep="password"
        initialEmail="ada@example.com"
        pending
      />,
    );

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });

  it("offers password recovery only once an address is known", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SignInFormView onSignIn={onSignIn} />);

    expect(screen.queryByRole("link", { name: /forgot/i })).not.toBeInTheDocument();

    await goToPasswordStep(user, "ada@example.com");

    expect(screen.getByRole("link", { name: /forgot/i })).toBeInTheDocument();
  });
});
