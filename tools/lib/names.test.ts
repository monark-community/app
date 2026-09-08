import { describe, expect, it } from "vitest";
import {
  camelCase,
  moduleEventsTypeName,
  moduleRouterName,
  packageDirName,
  pascalCase,
  routerKey,
} from "./names";

// These four helpers decide the identifiers `gen-events`, `gen-routers`
// and `gen-module` write into generated files. A change here silently
// renames a generated type or router key across the whole codegen
// surface, so they are worth pinning even though each is three lines.

describe("packageDirName", () => {
  it("strips the @monark/ scope", () => {
    expect(packageDirName("@monark/data-models")).toBe("data-models");
  });

  it("leaves an already-bare name alone", () => {
    expect(packageDirName("calendar")).toBe("calendar");
  });

  it("only strips the leading scope, not a later occurrence", () => {
    expect(packageDirName("@monark/x-@monark/y")).toBe("x-@monark/y");
  });
});

describe("pascalCase", () => {
  it("upper-cases each hyphen-separated part", () => {
    expect(pascalCase("data-models")).toBe("DataModels");
  });

  it("splits on underscores too", () => {
    expect(pascalCase("feature_flags")).toBe("FeatureFlags");
  });

  it("handles a single word", () => {
    expect(pascalCase("wiki")).toBe("Wiki");
  });

  it("leaves an already-capitalised part capitalised", () => {
    expect(pascalCase("API-keys")).toBe("APIKeys");
  });
});

describe("camelCase", () => {
  it("lower-cases only the first character", () => {
    expect(camelCase("data-models")).toBe("dataModels");
  });

  it("handles a single word", () => {
    expect(camelCase("wiki")).toBe("wiki");
  });
});

describe("generated identifier names", () => {
  it("derives the events union type name", () => {
    expect(moduleEventsTypeName("@monark/data-models")).toBe("DataModelsEvents");
  });

  it("derives the router export name", () => {
    expect(moduleRouterName("@monark/feature-flags")).toBe("featureFlagsRouter");
  });

  it("derives the app-router key", () => {
    expect(routerKey("@monark/api-keys")).toBe("apiKeys");
  });

  // The router key is what a tRPC caller types (`trpc.dataModels.…`), so
  // it must stay in lockstep with the export name it points at.
  it("keeps routerKey and moduleRouterName consistent", () => {
    for (const mod of ["@monark/wiki", "@monark/data-models", "@monark/feature-flags"]) {
      expect(moduleRouterName(mod)).toBe(`${routerKey(mod)}Router`);
    }
  });
});
