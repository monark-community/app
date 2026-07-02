import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import { emit, NotFoundError, UnauthorizedError, ValidationError } from "@monark/common";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import type {
  IndustryCreatedEvent,
  IndustryDeletedEvent,
  IndustryUpdatedEvent,
  ProjectCreatedEvent,
  ProjectDeletedEvent,
  ProjectUpdatedEvent,
} from "../contracts/events";
import {
  createIndustry,
  createProject,
  findFreeIndustrySlug,
  findFreeProjectSlug,
  findIndustryById,
  findProjectById,
  findProjectBySlug,
  hardDeleteIndustry,
  hardDeleteProject,
  listIndustries,
  listProjects,
  restoreIndustry,
  restoreProject,
  softDeleteIndustry,
  softDeleteProject,
  updateIndustry,
  updateProject,
} from "./data";

// Slug shape mirrors the Organization slug regex — alphanumeric +
// dashes, must start + end alphanumeric, 2..60 chars. Used wherever
// the user provides a slug explicitly ; auto-derived slugs go
// through `slugify` which produces the same shape by construction.
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const slugSchema = z
  .string()
  .trim()
  .min(2, "slug must be at least 2 characters")
  .max(60, "slug must be at most 60 characters")
  .regex(SLUG_REGEX, "slug must be lowercase alphanumeric with dashes");

const PROJECT_STATUSES = ["IDEA", "PROTOTYPE_AVAILABLE", "IN_PROGRESS", "QA", "COMPLETED"] as const;

const keywordsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(50)
  .transform((arr) =>
    // Normalize on the way in : lowercase, dedupe (keeping first-seen
    // order so the operator's stack ranking survives a save).
    Array.from(new Set(arr.map((kw) => kw.toLowerCase()))),
  );

const createProjectInput = z.object({
  title: z.string().trim().min(1).max(120),
  // Optional on create ; auto-derived from `title` via `slugify` +
  // `findFreeProjectSlug` when omitted. Operators who want a specific
  // slug pass it explicitly.
  slug: slugSchema.optional(),
  url: z.string().url().nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  publicStatus: z.enum(PROJECT_STATUSES).optional(),
  keywords: keywordsSchema.optional(),
  industryIds: z.array(z.string().min(1)).max(20).optional(),
  contributorMembershipIds: z.array(z.string().min(1)).max(50).optional(),
});

const updateProjectInput = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  slug: slugSchema.optional(),
  url: z.string().url().nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  publicStatus: z.enum(PROJECT_STATUSES).optional(),
  keywords: keywordsSchema.optional(),
  industryIds: z.array(z.string().min(1)).max(20).optional(),
  contributorMembershipIds: z.array(z.string().min(1)).max(50).optional(),
});

const createIndustryInput = z.object({
  displayName: z.string().trim().min(1).max(80),
  // Optional ; derived from displayName via `slugify` +
  // `findFreeIndustrySlug` when omitted.
  slug: slugSchema.optional(),
});

const updateIndustryInput = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(1).max(80).optional(),
  slug: slugSchema.optional(),
});

// Two sub-routers : projects (org-scoped) and industries (platform-
// scoped). The granular permissions are checked via requirePermission ;
// the admin role's umbrella grant covers everything by default, so the
// admin gate on the /admin layout is the practical authz boundary —
// the per-procedure permission check is the defense-in-depth layer.

export const projectsRouter = router({
  // ── Projects ───────────────────────────────────────────
  list: publicProcedure
    .input(
      z
        .object({
          publicStatus: z.enum(PROJECT_STATUSES).optional(),
          industryId: z.string().min(1).optional(),
          search: z.string().trim().max(120).optional(),
          includeDeleted: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "projects.read", org.id);
      return listProjects({
        organizationId: org.id,
        publicStatus: input?.publicStatus,
        industryId: input?.industryId,
        search: input?.search,
        includeDeleted: input?.includeDeleted ?? false,
      });
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "projects.read", org.id);
      const project = await findProjectById(input.id);
      if (!project || project.organizationId !== org.id) {
        throw new NotFoundError("Project", input.id);
      }
      return project;
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "projects.read", org.id);
      const project = await findProjectBySlug(org.id, input.slug);
      if (!project) throw new NotFoundError("Project", input.slug);
      return project;
    }),

  create: publicProcedure.input(createProjectInput).mutation(async ({ ctx, input }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "projects.write", org.id);

    // Auto-derive slug when the operator didn't pin one. The free-
    // slug helper appends `-2`, `-3`, … on collision so two
    // similarly-titled projects in the same org both succeed.
    const slug = input.slug ?? (await findFreeProjectSlug(org.id, input.title));

    const project = await createProject({
      organizationId: org.id,
      title: input.title,
      slug,
      url: input.url ?? null,
      description: input.description ?? null,
      publicStatus: input.publicStatus,
      keywords: input.keywords ?? [],
      industryIds: input.industryIds,
      contributorMembershipIds: input.contributorMembershipIds,
    });

    const event: ProjectCreatedEvent = {
      type: "project.created",
      projectId: project.id,
      organizationId: org.id,
      actorId: ctx.userId,
      occurredAt: new Date(),
    };
    await emit(event).catch(() => {});

    return project;
  }),

  update: publicProcedure.input(updateProjectInput).mutation(async ({ ctx, input }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "projects.write", org.id);

    const existing = await findProjectById(input.id);
    if (!existing || existing.organizationId !== org.id) {
      throw new NotFoundError("Project", input.id);
    }

    // Slug uniqueness check : auto-resolve collisions when the
    // operator changed `slug` to a value that already exists. We
    // could reject instead, but auto-resolving matches the create-
    // time behaviour and avoids a second round-trip from the UI.
    let resolvedSlug: string | undefined;
    if (input.slug !== undefined && input.slug !== existing.slug) {
      resolvedSlug = await findFreeProjectSlug(org.id, input.slug, input.id);
    }

    const previousSlug = existing.slug;
    const updated = await updateProject(input.id, {
      title: input.title,
      slug: resolvedSlug,
      url: input.url,
      description: input.description,
      publicStatus: input.publicStatus,
      keywords: input.keywords,
      industryIds: input.industryIds,
      contributorMembershipIds: input.contributorMembershipIds,
    });

    const changed: ProjectUpdatedEvent["changed"] = [];
    if (input.title !== undefined && input.title !== existing.title) changed.push("title");
    if (resolvedSlug && resolvedSlug !== existing.slug) changed.push("slug");
    if (input.url !== undefined && input.url !== existing.url) changed.push("url");
    if (input.description !== undefined && input.description !== existing.description)
      changed.push("description");
    if (input.publicStatus !== undefined && input.publicStatus !== existing.publicStatus)
      changed.push("publicStatus");
    if (input.keywords !== undefined) changed.push("keywords");
    if (input.industryIds !== undefined) changed.push("industries");
    if (input.contributorMembershipIds !== undefined) changed.push("contributors");

    if (changed.length > 0) {
      const event: ProjectUpdatedEvent = {
        type: "project.updated",
        projectId: updated.id,
        organizationId: org.id,
        actorId: ctx.userId,
        changed,
        ...(resolvedSlug && previousSlug !== resolvedSlug ? { previousSlug } : {}),
        occurredAt: new Date(),
      };
      await emit(event).catch(() => {});
    }

    return updated;
  }),

  // Soft-delete by default ; `hard: true` permanently removes the row +
  // cascades the M2M / contributors / industry joins. The admin UI
  // shows soft-deleted rows in a separate tab so an accidental
  // delete is recoverable via the `restore` mutation below.
  delete: publicProcedure
    .input(z.object({ id: z.string().min(1), hard: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "projects.delete", org.id);

      const existing = await findProjectById(input.id);
      if (!existing || existing.organizationId !== org.id) {
        throw new NotFoundError("Project", input.id);
      }

      const hard = input.hard ?? false;
      if (hard) {
        await hardDeleteProject(input.id);
      } else {
        await softDeleteProject(input.id);
      }

      const event: ProjectDeletedEvent = {
        type: "project.deleted",
        projectId: input.id,
        organizationId: org.id,
        actorId: ctx.userId,
        hard,
        occurredAt: new Date(),
      };
      await emit(event).catch(() => {});
    }),

  // Reverses a soft-delete. Useful when an admin trashes by accident.
  restore: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "projects.write", org.id);
      const existing = await findProjectById(input.id);
      if (!existing || existing.organizationId !== org.id) {
        throw new NotFoundError("Project", input.id);
      }
      if (!existing.deletedAt) {
        throw new ValidationError("Project is not deleted.");
      }
      await restoreProject(input.id);
    }),

  // ── Industries ─────────────────────────────────────────
  industries: router({
    list: publicProcedure
      .input(z.object({ includeDeleted: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        // Industries are platform-scope ; the org context here is just
        // for the admin gate's umbrella permission resolution.
        await requirePermission(ctx, "industries.read");
        return listIndustries({ includeDeleted: input?.includeDeleted ?? false });
      }),

    getById: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        await requirePermission(ctx, "industries.read");
        const industry = await findIndustryById(input.id);
        if (!industry) throw new NotFoundError("Industry", input.id);
        return industry;
      }),

    create: publicProcedure.input(createIndustryInput).mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      await requirePermission(ctx, "industries.write");

      const slug = input.slug ?? (await findFreeIndustrySlug(input.displayName));
      // If the operator passed an explicit slug that already exists,
      // we reject rather than mutating to a `-2` variant — they
      // asked for this exact slug and got it wrong.
      if (input.slug) {
        const collision = await findIndustryById(slug).catch(() => null);
        if (collision) {
          throw new ValidationError(`Industry slug "${slug}" is already taken.`);
        }
      }
      const industry = await createIndustry({ slug, displayName: input.displayName });

      const event: IndustryCreatedEvent = {
        type: "industry.created",
        industryId: industry.id,
        actorId: ctx.userId,
        occurredAt: new Date(),
      };
      await emit(event).catch(() => {});

      return industry;
    }),

    update: publicProcedure.input(updateIndustryInput).mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      await requirePermission(ctx, "industries.write");

      const existing = await findIndustryById(input.id);
      if (!existing) throw new NotFoundError("Industry", input.id);

      let resolvedSlug: string | undefined;
      if (input.slug !== undefined && input.slug !== existing.slug) {
        // Explicit slug : reject on collision (operator picked it).
        // Strip the deletedAt filter — colliding with a soft-deleted
        // row's slug is still a problem since the unique index
        // ignores the column.
        const sibling = await findIndustryById(input.slug).catch(() => null);
        if (sibling) {
          throw new ValidationError(`Industry slug "${input.slug}" is already taken.`);
        }
        resolvedSlug = input.slug;
      }

      const previousSlug = existing.slug;
      const updated = await updateIndustry(input.id, {
        displayName: input.displayName,
        slug: resolvedSlug,
      });

      const changed: IndustryUpdatedEvent["changed"] = [];
      if (input.displayName !== undefined && input.displayName !== existing.displayName)
        changed.push("displayName");
      if (resolvedSlug && resolvedSlug !== existing.slug) changed.push("slug");

      if (changed.length > 0) {
        const event: IndustryUpdatedEvent = {
          type: "industry.updated",
          industryId: updated.id,
          actorId: ctx.userId,
          changed,
          ...(resolvedSlug && previousSlug !== resolvedSlug ? { previousSlug } : {}),
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});
      }

      return updated;
    }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1), hard: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        await requirePermission(ctx, "industries.delete");

        const existing = await findIndustryById(input.id);
        if (!existing) throw new NotFoundError("Industry", input.id);

        const hard = input.hard ?? false;
        if (hard) {
          await hardDeleteIndustry(input.id);
        } else {
          await softDeleteIndustry(input.id);
        }

        const event: IndustryDeletedEvent = {
          type: "industry.deleted",
          industryId: input.id,
          actorId: ctx.userId,
          hard,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});
      }),

    restore: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        await requirePermission(ctx, "industries.write");
        const existing = await findIndustryById(input.id);
        if (!existing) throw new NotFoundError("Industry", input.id);
        if (!existing.deletedAt) {
          throw new ValidationError("Industry is not archived.");
        }
        await restoreIndustry(input.id);
      }),
  }),
});

// Re-exported helpers callers in adjacent modules may need (admin UI
// imports `slugify` for the create-form preview, integration tests
// reach for the data layer directly).
export {
  slugify,
  findFreeProjectSlug,
  findFreeIndustrySlug,
  findProjectById,
  findProjectBySlug,
  listProjects,
  listIndustries,
  findIndustryById,
  restoreIndustry,
} from "./data";
export { registerProjectsPermissions } from "./permissions";
export { registerProjectsEventTypes } from "./event-types";
export type {
  ProjectRow,
  ProjectListRow,
  IndustryRow,
  CreateProjectInput,
  UpdateProjectPatch,
} from "./data";
