import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { on, WILDCARD_EVENT_TYPE } from "@monark/common";
import type { DomainEvent } from "@monark/common/contracts/events";
import { t } from "@monark/common/trpc";
import { assignRole, createRole } from "@monark/rbac/server";
import { createBucketRow } from "../../src/server/data";
import { registerFilesPermissions } from "../../src/server/permissions";
import { filesRouter, setFileStorageForTesting, type FileStorage } from "../../src/server/index";

// Drives the REAL tRPC procedures (caller factory) with a FAKE storage backend
// (no Supabase). Covers the permission guards, the bucket-policy validation in
// `createUpload`, the finalize→READY flow, and the domain events. Mirrors
// data-models' / kanban's router suites ; self-contained (public APIs only).

const ORG = "files-router-org";
const U_MANAGER = "fr-manager"; // view + manage-buckets
const U_UPLOADER = "fr-uploader"; // view + upload + delete
const U_VIEWER = "fr-viewer"; // view only
const U_OUTSIDER = "fr-outsider"; // member, no role
const ALL_USERS = [U_MANAGER, U_UPLOADER, U_VIEWER, U_OUTSIDER];

// Fake storage : pretends every upload lands (getObjectInfo returns a size).
const fakeStorage: FileStorage = {
  createBucket: async () => {},
  createSignedUploadUrl: async (bucket, key) => ({
    signedUrl: `https://fake/${bucket}/${key}`,
    token: "fake-token",
    path: key,
  }),
  getObjectInfo: async () => ({ size: 123, contentType: "text/plain" }),
  createSignedDownloadUrl: async (bucket, key) => `https://fake/dl/${bucket}/${key}`,
  getPublicUrl: (bucket, key) => `https://fake/pub/${bucket}/${key}`,
  removeObject: async () => {},
};

const createCaller = t.createCallerFactory(filesRouter);
const callerFor = (userId: string) =>
  createCaller({ userId, activeOrganizationId: ORG, requestId: "fr-test" });

const captured: DomainEvent[] = [];
function eventsOfType<T extends DomainEvent["type"]>(type: T) {
  return captured.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);
}

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });
  // Global (non-org) tables shared across suites — clear so the seeded buckets
  // are the only ones this suite sees.
  await db.storedFile.deleteMany({});
  await db.fileBucket.deleteMany({});
  registerFilesPermissions();
  setFileStorageForTesting(fakeStorage);

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of ALL_USERS) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }

  const managerRole = await createRole({
    organizationId: ORG,
    key: "fr-manager-role",
    name: "Manager",
    permissions: ["files.view", "files.manage-buckets"],
    createdById: U_MANAGER,
  });
  await assignRole({
    userId: U_MANAGER,
    roleId: managerRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  const uploaderRole = await createRole({
    organizationId: ORG,
    key: "fr-uploader-role",
    name: "Uploader",
    permissions: ["files.view", "files.upload", "files.delete"],
    createdById: U_UPLOADER,
  });
  await assignRole({
    userId: U_UPLOADER,
    roleId: uploaderRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  const viewerRole = await createRole({
    organizationId: ORG,
    key: "fr-viewer-role",
    name: "Viewer",
    permissions: ["files.view"],
    createdById: U_MANAGER,
  });
  await assignRole({
    userId: U_VIEWER,
    roleId: viewerRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  // Seed two buckets : an open one and a policy-restricted one.
  await createBucketRow({ name: "open", isPublic: false, createdBy: U_MANAGER });
  await createBucketRow({
    name: "limited",
    isPublic: false,
    fileSizeLimit: 100,
    allowedMimeTypes: ["text/plain"],
    createdBy: U_MANAGER,
  });

  on(WILDCARD_EVENT_TYPE, (e) => {
    captured.push(e);
  });
});

beforeEach(() => {
  captured.length = 0;
});

afterAll(async () => {
  setFileStorageForTesting(undefined);
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });
});

describe("files router — RBAC guards", () => {
  it("denies buckets.list to a member without files.view", async () => {
    await expect(callerFor(U_OUTSIDER).buckets.list()).rejects.toThrow();
  });

  it("lets a viewer list buckets but denies uploading and creating buckets", async () => {
    await expect(callerFor(U_VIEWER).buckets.list()).resolves.toBeTruthy();
    await expect(
      callerFor(U_VIEWER).createUpload({
        bucket: "open",
        filename: "x.txt",
        contentType: "text/plain",
        size: 1,
      }),
    ).rejects.toThrow();
    await expect(
      callerFor(U_VIEWER).buckets.create({ name: "nope-bucket", isPublic: false }),
    ).rejects.toThrow();
  });
});

describe("files router — buckets", () => {
  it("creates a private bucket and emits bucket-created (manage-buckets)", async () => {
    const bucket = await callerFor(U_MANAGER).buckets.create({
      name: "created-bucket",
      isPublic: false,
    });
    expect(bucket.name).toBe("created-bucket");
    expect(eventsOfType("files.bucket-created").map((e) => e.bucket)).toEqual(["created-bucket"]);
  });

  it("denies a non-sysadmin creating a PUBLIC bucket (platform-tier only)", async () => {
    await expect(
      callerFor(U_MANAGER).buckets.create({ name: "public-bucket", isPublic: true }),
    ).rejects.toThrow(/platform administrator/i);
  });

  it("rejects a duplicate bucket name", async () => {
    await expect(
      callerFor(U_MANAGER).buckets.create({ name: "open", isPublic: false }),
    ).rejects.toThrow();
  });
});

describe("files router — upload flow + policy", () => {
  it("createUpload → finalize flips to READY and emits file-uploaded", async () => {
    const ticket = await callerFor(U_UPLOADER).createUpload({
      bucket: "open",
      filename: "hello.txt",
      contentType: "text/plain",
      size: 5,
    });
    expect(ticket.signedUrl).toContain("open");
    expect(ticket.token).toBeTruthy();

    const stored = await callerFor(U_UPLOADER).finalize({ fileId: ticket.fileId });
    expect(stored.status).toBe("READY");
    expect(stored.size).toBe(123); // captured from the fake storage's getObjectInfo

    const uploaded = eventsOfType("files.file-uploaded");
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]?.fileId).toBe(ticket.fileId);

    // It now shows in the org's file list.
    const list = await callerFor(U_UPLOADER).list({ bucket: "open" });
    expect(list.items.map((f) => f.id)).toContain(ticket.fileId);
  });

  it("rejects an upload over the bucket size limit", async () => {
    await expect(
      callerFor(U_UPLOADER).createUpload({
        bucket: "limited",
        filename: "big.txt",
        contentType: "text/plain",
        size: 200, // limit is 100
      }),
    ).rejects.toThrow();
  });

  it("rejects an upload whose content type isn't allowed", async () => {
    await expect(
      callerFor(U_UPLOADER).createUpload({
        bucket: "limited",
        filename: "pic.png",
        contentType: "image/png", // only text/plain allowed
        size: 10,
      }),
    ).rejects.toThrow();
  });

  it("removes a file and emits file-deleted", async () => {
    const ticket = await callerFor(U_UPLOADER).createUpload({
      bucket: "open",
      filename: "gone.txt",
      contentType: "text/plain",
      size: 5,
    });
    await callerFor(U_UPLOADER).finalize({ fileId: ticket.fileId });
    captured.length = 0;

    await callerFor(U_UPLOADER).remove({ fileId: ticket.fileId });
    expect(eventsOfType("files.file-deleted").map((e) => e.fileId)).toEqual([ticket.fileId]);

    // No longer listed.
    const list = await callerFor(U_UPLOADER).list({ bucket: "open" });
    expect(list.items.map((f) => f.id)).not.toContain(ticket.fileId);
  });
});
