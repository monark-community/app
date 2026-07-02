import { describe, expect, it, vi } from "vitest";
import { renderWithIntl, screen } from "../test-utils";
import { BrandedAppLogoView, type BrandedAppLogoData } from "@/components/branded-app-logo-view";

// `next/image` doesn't render in jsdom out of the box (calls into
// the framework's runtime). Stub to a plain `<img>` so the
// fallback-brand branch produces a real DOM node we can query.
// Forwards `className` so the className-pass-through assertion below
// can verify it lands.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
  }) => (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      data-testid="next-image"
    />
  ),
}));

// `@monark/branding` resolves through tsconfig paths in the workspace,
// but bringing the real module into the unit suite drags in image
// asset imports. Stub it with the shape the view reads.
vi.mock("@monark/branding", () => ({
  BRANDING: {
    appName: "Monark",
    logoSrc: "/logo.svg",
  },
}));

const SINGLETON_LOGO: BrandedAppLogoData = {
  singletonLogoUrl: "https://supabase.test/storage/v1/object/public/avatars/org-logos/abc/123.webp",
  singletonDisplayName: "Acme Inc.",
  isSingleTenantBootstrapped: true,
};

const SINGLETON_NO_LOGO: BrandedAppLogoData = {
  singletonLogoUrl: null,
  singletonDisplayName: "Acme Inc.",
  isSingleTenantBootstrapped: true,
};

const NO_SINGLETON: BrandedAppLogoData = {
  singletonLogoUrl: null,
  singletonDisplayName: null,
  isSingleTenantBootstrapped: false,
};

describe("<BrandedAppLogoView>", () => {
  describe("singleton with logo (production single-tenant, fully provisioned)", () => {
    it("renders the org's uploaded logoUrl as an <img>", () => {
      renderWithIntl(<BrandedAppLogoView data={SINGLETON_LOGO} size={28} />);
      const img = screen.getByRole("img", { name: "Acme Inc." });
      expect(img).toBeInTheDocument();
      expect(img.getAttribute("src")).toBe(SINGLETON_LOGO.singletonLogoUrl);
    });

    it("uses the provided size for both width / height attributes + the inline style", () => {
      renderWithIntl(<BrandedAppLogoView data={SINGLETON_LOGO} size={48} />);
      const img = screen.getByRole("img", { name: "Acme Inc." }) as HTMLImageElement;
      expect(img.getAttribute("width")).toBe("48");
      expect(img.getAttribute("height")).toBe("48");
      expect(img.style.width).toBe("48px");
      expect(img.style.height).toBe("48px");
    });

    it("uses an empty alt when displayName is missing (decorative fallback)", () => {
      const data: BrandedAppLogoData = {
        ...SINGLETON_LOGO,
        singletonDisplayName: null,
      };
      const { container } = renderWithIntl(<BrandedAppLogoView data={data} size={28} />);
      const img = container.querySelector("img");
      expect(img?.getAttribute("alt")).toBe("");
    });

    it("does NOT render the empty-square placeholder when a logo exists", () => {
      const { container } = renderWithIntl(<BrandedAppLogoView data={SINGLETON_LOGO} size={28} />);
      // Building2 is rendered as an <svg> ; the `<img>` branch returns
      // before it ever reaches the placeholder span.
      expect(container.querySelector("svg")).toBeNull();
    });
  });

  describe("singleton without logo (single-tenant, freshly bootstrapped)", () => {
    it("renders the empty-square placeholder with the Building2 glyph", () => {
      const { container } = renderWithIntl(
        <BrandedAppLogoView data={SINGLETON_NO_LOGO} size={28} />,
      );
      // The placeholder is a <span> with the org's display name in its
      // aria-label, containing a decorative <svg> (Building2).
      const placeholder = container.querySelector("span[aria-label='Acme Inc.']");
      expect(placeholder).not.toBeNull();
      expect(placeholder?.querySelector("svg")).not.toBeNull();
    });

    it("sets the box dimensions from `size`", () => {
      const { container } = renderWithIntl(
        <BrandedAppLogoView data={SINGLETON_NO_LOGO} size={64} />,
      );
      const placeholder = container.querySelector("span") as HTMLElement;
      expect(placeholder.style.width).toBe("64px");
      expect(placeholder.style.height).toBe("64px");
    });

    it("does NOT render the starter-template <img> fallback in this branch", () => {
      renderWithIntl(<BrandedAppLogoView data={SINGLETON_NO_LOGO} size={28} />);
      expect(screen.queryByTestId("next-image")).toBeNull();
    });
  });

  describe("no singleton (multi-tenant, /setup pending, api hiccup)", () => {
    it("falls back to the starter-template logo from BRANDING", () => {
      renderWithIntl(<BrandedAppLogoView data={NO_SINGLETON} size={56} />);
      const fallback = screen.getByTestId("next-image");
      expect(fallback.getAttribute("src")).toBe("/logo.svg");
      expect(fallback.getAttribute("alt")).toBe("Monark");
      expect(fallback.getAttribute("width")).toBe("56");
      expect(fallback.getAttribute("height")).toBe("56");
    });

    it("does NOT render the singleton's <img> branch", () => {
      const { container } = renderWithIntl(<BrandedAppLogoView data={NO_SINGLETON} size={28} />);
      // Only the next/image stub should be on the page ; no other
      // <img> elements — explicit assertion that the singleton-logo
      // path didn't fire.
      const realImgs = container.querySelectorAll("img:not([data-testid='next-image'])");
      expect(realImgs.length).toBe(0);
    });

    it("does NOT render the empty-square placeholder", () => {
      const { container } = renderWithIntl(<BrandedAppLogoView data={NO_SINGLETON} size={28} />);
      // Placeholder span has aria-label + a Building2 svg ; the
      // fallback branch has neither.
      expect(container.querySelector("span[aria-label]")).toBeNull();
    });
  });

  describe("size + className pass-through", () => {
    it("applies className to the <img> branch", () => {
      const { container } = renderWithIntl(
        <BrandedAppLogoView data={SINGLETON_LOGO} size={28} className="extra-class" />,
      );
      const img = container.querySelector("img");
      expect(img?.className).toContain("extra-class");
    });

    it("applies className to the placeholder branch", () => {
      const { container } = renderWithIntl(
        <BrandedAppLogoView data={SINGLETON_NO_LOGO} size={28} className="placeholder-class" />,
      );
      const span = container.querySelector("span");
      expect(span?.className).toContain("placeholder-class");
    });

    it("applies className to the fallback branch", () => {
      const { container } = renderWithIntl(
        <BrandedAppLogoView data={NO_SINGLETON} size={28} className="fallback-class" />,
      );
      const fallback = container.querySelector("img");
      expect(fallback?.className).toContain("fallback-class");
    });

    it("defaults size to 48 when not provided", () => {
      renderWithIntl(<BrandedAppLogoView data={SINGLETON_LOGO} />);
      const img = screen.getByRole("img", { name: "Acme Inc." });
      expect(img.getAttribute("width")).toBe("48");
      expect(img.getAttribute("height")).toBe("48");
    });
  });
});
