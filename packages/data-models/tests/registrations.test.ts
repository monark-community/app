import { describe, expect, it } from "vitest";
import { getEventTypeDescriptor } from "@monark/common";
import { getPermissionDef } from "@monark/rbac/server";
import {
  perModelEventType,
  perModelPermissionDotted,
  perModelPermissionKey,
  recordPermissionVerb,
  registerDataModelRegistrations,
} from "../src/server/registrations";

// Unit coverage for per-model RBAC + event-type registration. The registries
// are process-global in-memory maps ; these specs use a model key unique to
// this file so reads don't collide with other suites registering into the
// same maps. No DB — `registerDataModelRegistrations` only touches the
// in-memory registries (the DB-walking `hydrate*` variant is covered by the
// api boot path, not here).

describe("data-models/registrations — key conventions", () => {
  it("derives stable per-model permission keys", () => {
    expect(perModelPermissionKey("project", "read")).toBe("project-record-read");
    expect(perModelPermissionDotted("project", "write")).toBe("data-models.project-record-write");
    // Model keys may contain hyphens ; the derived key stays valid.
    expect(perModelPermissionDotted("my-model", "delete")).toBe(
      "data-models.my-model-record-delete",
    );
  });

  it("derives per-model event types", () => {
    expect(perModelEventType("project", "created")).toBe("data-models.project-record-created");
    expect(perModelEventType("project", "updated")).toBe("data-models.project-record-updated");
    expect(perModelEventType("project", "deleted")).toBe("data-models.project-record-deleted");
  });

  it("maps generic record permissions to a verb, schema perms to null", () => {
    expect(recordPermissionVerb("data-models.record-read")).toBe("read");
    expect(recordPermissionVerb("data-models.record-write")).toBe("write");
    expect(recordPermissionVerb("data-models.record-delete")).toBe("delete");
    expect(recordPermissionVerb("data-models.read-schema")).toBeNull();
    expect(recordPermissionVerb("data-models.manage-schema")).toBeNull();
  });
});

describe("data-models/registrations — registration", () => {
  const KEY = "regtest-widgets";

  it("registers the three record permissions grouped under the model name", () => {
    registerDataModelRegistrations({ key: KEY, name: "Widgets" });

    const read = getPermissionDef(`data-models.${KEY}-record-read`);
    expect(read?.category).toBe("Data Model: Widgets");
    expect(read?.description).toContain("Widgets");
    // Marked org-scoped so the RBAC catalog filters it by the caller's org.
    expect(read?.orgScoped).toBe(true);
    expect(getPermissionDef(`data-models.${KEY}-record-write`)).toBeDefined();
    expect(getPermissionDef(`data-models.${KEY}-record-delete`)).toBeDefined();
  });

  it("registers the three record event types grouped under the model name", () => {
    registerDataModelRegistrations({ key: KEY, name: "Widgets" });

    const created = getEventTypeDescriptor(`data-models.${KEY}-record-created`);
    expect(created?.module).toBe("Data Model: Widgets");
    expect(created?.description).toContain("Widgets");
    expect(getEventTypeDescriptor(`data-models.${KEY}-record-updated`)).toBeDefined();
    expect(getEventTypeDescriptor(`data-models.${KEY}-record-deleted`)).toBeDefined();
  });

  it("refreshes labels on rename (stable keys, last-write-wins)", () => {
    registerDataModelRegistrations({ key: KEY, name: "Widgets" });
    registerDataModelRegistrations({ key: KEY, name: "Gadgets" });

    const read = getPermissionDef(`data-models.${KEY}-record-read`);
    expect(read?.category).toBe("Data Model: Gadgets");
    expect(read?.description).toContain("Gadgets");
    expect(getEventTypeDescriptor(`data-models.${KEY}-record-created`)?.module).toBe(
      "Data Model: Gadgets",
    );
  });
});
