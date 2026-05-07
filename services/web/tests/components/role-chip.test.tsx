import { describe, expect, it, vi } from "vitest"
import { renderWithIntl, screen, userEvent } from "../test-utils"
import { RoleChip } from "@/components/role-chip"

describe("<RoleChip>", () => {
  it("renders the role name", () => {
    renderWithIntl(<RoleChip name="Administrator" color={null} />)
    expect(screen.getByText("Administrator")).toBeInTheDocument()
  })

  it("falls back to muted styling when color is null", () => {
    const { container } = renderWithIntl(
      <RoleChip name="Moderator" color={null} />,
    )
    const chip = container.firstChild as HTMLElement
    expect(chip.className).toContain("bg-muted")
    expect(chip.className).toContain("text-muted-foreground")
  })

  it("falls back to muted styling when color is undefined", () => {
    const { container } = renderWithIntl(
      <RoleChip name="Editor" color={undefined} />,
    )
    const chip = container.firstChild as HTMLElement
    expect(chip.className).toContain("bg-muted")
  })

  it("uses the color tint when a hex color is supplied", () => {
    const { container } = renderWithIntl(
      <RoleChip name="Lead" color="#F0870C" />,
    )
    const chip = container.firstChild as HTMLElement
    // The tint is a 15 % alpha of the color (`{color}26`). The dot
    // reads the same colour at full saturation.
    expect(chip.style.backgroundColor).toBeTruthy()
    // The dot is an aria-hidden span ; finding it via the structural
    // role keeps the test independent of the rest of the styling.
    const dot = chip.querySelector("[aria-hidden]") as HTMLElement
    expect(dot).toBeTruthy()
    expect(dot.style.backgroundColor).toBeTruthy()
  })

  it("merges any custom className without dropping the base classes", () => {
    const { container } = renderWithIntl(
      <RoleChip
        name="Viewer"
        color={null}
        className="ring-2 ring-primary"
      />,
    )
    const chip = container.firstChild as HTMLElement
    expect(chip.className).toContain("ring-2")
    expect(chip.className).toContain("ring-primary")
    expect(chip.className).toContain("inline-flex") // base class still there
  })

  it("does not render the remove button when onRemove is omitted", () => {
    renderWithIntl(<RoleChip name="Reviewer" color={null} />)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("renders an X-icon remove button when onRemove is provided", () => {
    renderWithIntl(
      <RoleChip
        name="Reviewer"
        color={null}
        onRemove={() => {}}
        removeAriaLabel="Revoke Reviewer"
      />,
    )
    expect(
      screen.getByRole("button", { name: "Revoke Reviewer" }),
    ).toBeInTheDocument()
  })

  it("fires onRemove when the X is clicked", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    renderWithIntl(
      <RoleChip
        name="Reviewer"
        color={null}
        onRemove={onRemove}
        removeAriaLabel="Revoke Reviewer"
      />,
    )
    await user.click(screen.getByRole("button", { name: "Revoke Reviewer" }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it("disables the remove button when removeDisabled is true", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    renderWithIntl(
      <RoleChip
        name="Reviewer"
        color={null}
        onRemove={onRemove}
        removeAriaLabel="Revoke Reviewer"
        removeDisabled
      />,
    )
    const button = screen.getByRole("button", { name: "Revoke Reviewer" })
    expect(button).toBeDisabled()
    // user-event respects `disabled` and won't fire the click.
    await user.click(button)
    expect(onRemove).not.toHaveBeenCalled()
  })
})
