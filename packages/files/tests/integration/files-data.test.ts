import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import {
  createBucketRow,
  createPendingFile,
  findBucketByName,
  findFileById,
  listBuckets,
  listFiles,
  markFileReady,
  softDeleteFile,
} from "../../src/server/data";

// The files data layer against a real Postgres testcontainer : bucket rows, the
// pending→ready lifecycle, the READY-only + org-scoped list, and soft-delete.

const ORG = "files-data-org";

beforeAll(async () => {
  // FileBucket is global (not org-scoped) and shared across suites in the same
  // container — start from a clean slate so `listBuckets()` is deterministic.
  await truncate(getDb(), ["StoredFile", "FileBucket"]);
  await getDb().organization.upsert({
    where: { id: ORG },
    create: { id: ORG, slug: ORG, displayName: ORG },
    update: {},
  });
});

afterEach(async () => {
  await truncate(getDb(), ["StoredFile", "FileBucket"]);
});

afterAll(async () => {
  await getDb()
    .organization.delete({ where: { id: ORG } })
    .catch(() => {});
});

async function seedReady(id: string, bucket: string, size: number): Promise<void> {
  const f = await createPendingFile({
    id,
    organizationId: ORG,
    bucket,
    key: `${ORG}/${id}`,
    name: id,
    contentType: "text/plain",
    size,
    uploadedBy: "u1",
  });
  await markFileReady(f.id, { size });
}

describe("files data layer", () => {
  it("creates a bucket, finds it by name, and lists it", async () => {
    const bucket = await createBucketRow({
      name: "docs",
      isPublic: false,
      fileSizeLimit: 1000,
      allowedMimeTypes: ["application/pdf"],
      createdBy: "u1",
    });
    expect(bucket.name).toBe("docs");
    expect(bucket.allowedMimeTypes).toEqual(["application/pdf"]);
    expect((await findBucketByName("docs"))?.id).toBe(bucket.id);
    expect((await listBuckets()).map((b) => b.name)).toEqual(["docs"]);
  });

  it("lists only READY, non-deleted files (pending + deleted are hidden)", async () => {
    const pending = await createPendingFile({
      id: "f1",
      organizationId: ORG,
      bucket: "docs",
      key: `${ORG}/f1`,
      name: "a.txt",
      contentType: "text/plain",
      size: 10,
      uploadedBy: "u1",
    });
    // Still PENDING → not listed.
    expect((await listFiles({ organizationId: ORG })).items).toHaveLength(0);

    // Finalize → READY, real size captured, now listed.
    await markFileReady(pending.id, { size: 20 });
    const page = await listFiles({ organizationId: ORG });
    expect(page.items.map((f) => f.id)).toEqual(["f1"]);
    expect(page.items[0]?.size).toBe(20);
    expect((await findFileById("f1"))?.status).toBe("READY");

    // Soft-delete → out of the list.
    await softDeleteFile("f1");
    expect((await listFiles({ organizationId: ORG })).items).toHaveLength(0);
    expect(await findFileById("f1")).toBeNull();
  });

  it("filters by bucket and paginates", async () => {
    await seedReady("d0", "docs", 0);
    await seedReady("d1", "docs", 1);
    await seedReady("d2", "docs", 2);
    await seedReady("i0", "images", 5);

    // Scoped to one bucket.
    const docs = await listFiles({ organizationId: ORG, bucket: "docs" });
    expect(docs.total).toBe(3);
    expect(docs.items.every((f) => f.bucket === "docs")).toBe(true);

    // Paginated across all buckets.
    const first = await listFiles({ organizationId: ORG, limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.total).toBe(4);
    expect(first.nextCursor).toBeTruthy();
    const second = await listFiles({ organizationId: ORG, limit: 2, cursor: first.nextCursor });
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
  });
});
