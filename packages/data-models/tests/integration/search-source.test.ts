import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import {
  createDataModel,
  createDataRecord,
  searchRecordsAcrossModels,
} from "../../src/server/data";

// Cross-model record search (powers the global palette's "Records" group).
// Focus : it title-matches ONLY within the readable model set + carries each
// hit's model key/name. Row-level role access is exercised with `bypass: true`
// (the RBAC deny paths live in authorization.test.ts).

const ORG = "dm-search-org";
const USER = "dm-search-user";
let alphaId = "";
let betaId = "";

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });

  const alpha = await createDataModel({
    organizationId: ORG,
    key: "alpha",
    name: "Alpha",
    createdBy: USER,
  });
  const beta = await createDataModel({
    organizationId: ORG,
    key: "beta",
    name: "Beta",
    createdBy: USER,
  });
  alphaId = alpha.id;
  betaId = beta.id;
  // The reserved `title` field is auto-created with the model.
  await createDataRecord({
    dataModelId: alpha.id,
    data: { title: "Quarterly report" },
    createdBy: USER,
  });
  await createDataRecord({
    dataModelId: alpha.id,
    data: { title: "Annual report" },
    createdBy: USER,
  });
  await createDataRecord({
    dataModelId: beta.id,
    data: { title: "Report from beta" },
    createdBy: USER,
  });
});

afterAll(async () => {
  await getDb()
    .organization.delete({ where: { id: ORG } })
    .catch(() => {});
});

const base = { organizationId: ORG, roleIds: [] as string[], bypassRoleAccess: true, limit: 8 };

describe("searchRecordsAcrossModels", () => {
  it("matches titles only within the readable models, with model key + name", async () => {
    const hits = await searchRecordsAcrossModels({
      ...base,
      readableModelIds: [alphaId],
      query: "report",
    });
    expect(hits.map((h) => h.title).sort()).toEqual(["Annual report", "Quarterly report"]);
    expect(hits.every((h) => h.modelKey === "alpha" && h.modelName === "Alpha")).toBe(true);
    // beta's record is excluded — beta isn't in `readableModelIds`.
    expect(hits.some((h) => h.title.includes("beta"))).toBe(false);
  });

  it("returns nothing when no models are readable", async () => {
    const hits = await searchRecordsAcrossModels({
      ...base,
      readableModelIds: [],
      query: "report",
    });
    expect(hits).toEqual([]);
  });

  it("spans every readable model", async () => {
    const hits = await searchRecordsAcrossModels({
      ...base,
      readableModelIds: [alphaId, betaId],
      query: "report",
    });
    expect(hits).toHaveLength(3);
    expect(new Set(hits.map((h) => h.modelKey))).toEqual(new Set(["alpha", "beta"]));
  });
});
