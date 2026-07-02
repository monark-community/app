import { getDb, type Prisma } from "@monark/db";

// Local mirror of the Prisma enum — `@monark/db` will re-export the
// generated `ProjectPublicStatus` after the next `pnpm db:generate`,
// at which point we can swap to the imported version. Keeping a
// hand-written union here means typecheck doesn't depend on the
// generated client being current (Windows file-lock on the query
// engine DLL is a daily occurrence in dev).
export type ProjectPublicStatus =
  | "IDEA"
  | "PROTOTYPE_AVAILABLE"
  | "IN_PROGRESS"
  | "QA"
  | "COMPLETED";

export type ProjectRow = Prisma.ProjectGetPayload<{
  include: {
    industries: true;
    contributors: {
      include: {
        membership: {
          include: { user: true };
        };
      };
    };
  };
}>;

export type ProjectListRow = Prisma.ProjectGetPayload<{
  include: { industries: true };
}>;

export type IndustryRow = Prisma.IndustryGetPayload<Record<string, never>>;

// Slug derivation : lowercase, collapse whitespace + punctuation to
// dashes, strip non-[a-z0-9-], collapse + trim dashes, cap at 60 chars.
// Matches the same shape the organizations slug regex enforces
// (`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`) so the same downstream URL
// patterns work. Returns "" if nothing usable survives — callers
// fall back to a cuid in that case.
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// Find a slug that doesn't collide with an existing Project in the
// same org. If `desired` is free, returns it ; otherwise appends
// `-2`, `-3`, … until a free slot opens. Capped at 999 to bound the
// query loop on a pathological collision pattern ; in practice
// real-world projects don't pile up that high.
export async function findFreeProjectSlug(
  organizationId: string,
  desired: string,
  ignoreId?: string,
): Promise<string> {
  const db = getDb();
  const base = slugify(desired) || "project";
  for (let n = 0; n < 999; n += 1) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const collision = await db.project.findFirst({
      where: {
        organizationId,
        slug: candidate,
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (!collision) return candidate;
  }
  // 999 collisions on a derived slug is operator territory ; surface
  // a clear failure rather than picking something arbitrary.
  throw new Error(`could not derive a free project slug from ${JSON.stringify(desired)}`);
}

export async function findFreeIndustrySlug(desired: string, ignoreId?: string): Promise<string> {
  const db = getDb();
  const base = slugify(desired) || "industry";
  for (let n = 0; n < 999; n += 1) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const collision = await db.industry.findFirst({
      where: { slug: candidate, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
      select: { id: true },
    });
    if (!collision) return candidate;
  }
  throw new Error(`could not derive a free industry slug from ${JSON.stringify(desired)}`);
}

const PROJECT_DETAIL_INCLUDE = {
  industries: true,
  contributors: {
    include: {
      membership: {
        include: { user: true },
      },
    },
  },
} as const satisfies Prisma.ProjectInclude;

export async function findProjectById(id: string): Promise<ProjectRow | null> {
  const db = getDb();
  return db.project.findUnique({
    where: { id },
    include: PROJECT_DETAIL_INCLUDE,
  });
}

export async function findProjectBySlug(
  organizationId: string,
  slug: string,
): Promise<ProjectRow | null> {
  const db = getDb();
  return db.project.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
    include: PROJECT_DETAIL_INCLUDE,
  });
}

export type ListProjectsInput = {
  organizationId: string;
  publicStatus?: ProjectPublicStatus;
  industryId?: string;
  search?: string;
  includeDeleted?: boolean;
};

export async function listProjects(input: ListProjectsInput): Promise<ProjectListRow[]> {
  const db = getDb();
  return db.project.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.includeDeleted ? {} : { deletedAt: null }),
      ...(input.publicStatus ? { publicStatus: input.publicStatus } : {}),
      ...(input.industryId ? { industries: { some: { id: input.industryId } } } : {}),
      ...(input.search && input.search.trim().length > 0
        ? {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { slug: { contains: input.search, mode: "insensitive" } },
              { keywords: { has: input.search.toLowerCase() } },
            ],
          }
        : {}),
    },
    include: { industries: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

export type CreateProjectInput = {
  organizationId: string;
  title: string;
  slug: string;
  url?: string | null;
  description?: string | null;
  publicStatus?: ProjectPublicStatus;
  keywords?: string[];
  industryIds?: string[];
  contributorMembershipIds?: string[];
};

export async function createProject(input: CreateProjectInput): Promise<ProjectRow> {
  const db = getDb();
  const created = await db.project.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      slug: input.slug,
      url: input.url ?? null,
      description: input.description ?? null,
      ...(input.publicStatus ? { publicStatus: input.publicStatus } : {}),
      keywords: input.keywords ?? [],
      industries:
        input.industryIds && input.industryIds.length > 0
          ? { connect: input.industryIds.map((id) => ({ id })) }
          : undefined,
      contributors:
        input.contributorMembershipIds && input.contributorMembershipIds.length > 0
          ? {
              create: input.contributorMembershipIds.map((membershipId) => ({
                membershipId,
              })),
            }
          : undefined,
    },
    include: PROJECT_DETAIL_INCLUDE,
  });
  return created;
}

export type UpdateProjectPatch = {
  title?: string;
  slug?: string;
  url?: string | null;
  description?: string | null;
  publicStatus?: ProjectPublicStatus;
  keywords?: string[];
  // Full-replacement semantics : if provided, the M2M is reset to
  // exactly this list. Omit to leave existing relations untouched.
  industryIds?: string[];
  contributorMembershipIds?: string[];
};

export async function updateProject(id: string, patch: UpdateProjectPatch): Promise<ProjectRow> {
  const db = getDb();
  return db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.url !== undefined ? { url: patch.url } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.publicStatus !== undefined ? { publicStatus: patch.publicStatus } : {}),
        ...(patch.keywords !== undefined ? { keywords: patch.keywords } : {}),
      },
    });
    if (patch.industryIds !== undefined) {
      // Full reset of the M2M : Prisma's `set` connects exactly these
      // ids and disconnects everything else atomically inside the tx.
      await tx.project.update({
        where: { id },
        data: {
          industries: { set: patch.industryIds.map((iid) => ({ id: iid })) },
        },
      });
    }
    if (patch.contributorMembershipIds !== undefined) {
      // Full reset of the contributors join : drop the rows that
      // aren't in the new list, then add the rows that aren't yet
      // there. Simpler than diffing client-side ; the table has a
      // unique constraint that swallows duplicate creates.
      await tx.projectContributor.deleteMany({
        where: {
          projectId: id,
          membershipId: { notIn: patch.contributorMembershipIds },
        },
      });
      for (const membershipId of patch.contributorMembershipIds) {
        await tx.projectContributor.upsert({
          where: {
            projectId_membershipId: { projectId: id, membershipId },
          },
          create: { projectId: id, membershipId },
          update: {},
        });
      }
    }
    const fresh = await tx.project.findUnique({
      where: { id },
      include: PROJECT_DETAIL_INCLUDE,
    });
    if (!fresh) {
      throw new Error(`project ${id} disappeared mid-update`);
    }
    return fresh;
  });
}

export async function softDeleteProject(id: string): Promise<void> {
  const db = getDb();
  await db.project.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function restoreProject(id: string): Promise<void> {
  const db = getDb();
  await db.project.update({
    where: { id },
    data: { deletedAt: null },
  });
}

export async function hardDeleteProject(id: string): Promise<void> {
  const db = getDb();
  await db.project.delete({ where: { id } });
}

// ── Industries ───────────────────────────────────────────

export async function listIndustries(
  opts: {
    includeDeleted?: boolean;
  } = {},
): Promise<IndustryRow[]> {
  const db = getDb();
  return db.industry.findMany({
    where: opts.includeDeleted ? {} : { deletedAt: null },
    orderBy: [{ displayName: "asc" }],
  });
}

export async function findIndustryById(id: string): Promise<IndustryRow | null> {
  const db = getDb();
  return db.industry.findUnique({ where: { id } });
}

export async function createIndustry(input: {
  slug: string;
  displayName: string;
}): Promise<IndustryRow> {
  const db = getDb();
  return db.industry.create({ data: input });
}

export async function updateIndustry(
  id: string,
  patch: { slug?: string; displayName?: string },
): Promise<IndustryRow> {
  const db = getDb();
  return db.industry.update({ where: { id }, data: patch });
}

export async function softDeleteIndustry(id: string): Promise<void> {
  const db = getDb();
  await db.industry.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function restoreIndustry(id: string): Promise<void> {
  const db = getDb();
  await db.industry.update({
    where: { id },
    data: { deletedAt: null },
  });
}

export async function hardDeleteIndustry(id: string): Promise<void> {
  const db = getDb();
  await db.industry.delete({ where: { id } });
}
