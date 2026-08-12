import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import {
  NotFoundError,
  UnauthorizedError,
  eventFieldsFor,
  listEventTypesByModule,
} from "@monark/common";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import {
  createAchievement,
  createRule,
  deleteRule,
  findAchievementById,
  findRuleById,
  listAchievements,
  listAwardsForUser,
  listProgressForUser,
  listRulesForAchievement,
  resolveIconUrls,
  summarizeAwardsForUser,
  softDeleteAchievement,
  updateAchievement,
  updateRule,
  type AchievementRow,
  type AchievementRuleRow,
} from "./data";

const matchSchema = z.record(z.string(), z.string()).nullable().optional();

function serializeAchievement(a: AchievementRow, iconUrl: string | null) {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    iconFileId: a.iconFileId,
    iconUrl,
    points: a.points,
    enabled: a.enabled,
    createdAt: a.createdAt,
  };
}

/** Resolve one achievement's badge URL (for a create/update return). */
async function iconUrlFor(orgId: string, a: AchievementRow): Promise<string | null> {
  if (!a.iconFileId) return null;
  return (await resolveIconUrls(orgId, [a.iconFileId])).get(a.iconFileId) ?? null;
}

function serializeRule(r: AchievementRuleRow) {
  return {
    id: r.id,
    achievementId: r.achievementId,
    eventType: r.eventType,
    threshold: r.threshold,
    subjectField: r.subjectField,
    match: (r.match ?? null) as Record<string, string> | null,
  };
}

/** Load an achievement in the caller's org after a manage-permission check. */
async function requireManagedAchievement(
  ctx: { userId: string | null; activeOrganizationId: string | null; requestId: string },
  id: string,
) {
  if (!ctx.userId) throw new UnauthorizedError();
  const org = await requireOrg({
    userId: ctx.userId,
    activeOrganizationId: ctx.activeOrganizationId,
  });
  await requirePermission(ctx, "achievements.manage", org.id);
  const achievement = await findAchievementById(id);
  if (!achievement || achievement.organizationId !== org.id)
    throw new NotFoundError("Achievement", id);
  return { org, achievement };
}

export const achievementsRouter = router({
  // ── Admin config (manage) ──────────────────────────────
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "achievements.manage", org.id);
    const achievements = await listAchievements(org.id, { includeDisabled: true });
    const urls = await resolveIconUrls(
      org.id,
      achievements.map((a) => a.iconFileId ?? ""),
    );
    const withRules = await Promise.all(
      achievements.map(async (a) => ({
        ...serializeAchievement(a, a.iconFileId ? (urls.get(a.iconFileId) ?? null) : null),
        rules: (await listRulesForAchievement(a.id)).map(serializeRule),
      })),
    );
    return withRules;
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(1000).optional(),
        iconFileId: z.string().min(1).nullable().optional(),
        points: z.number().int().min(0).max(100000).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "achievements.manage", org.id);
      const a = await createAchievement({
        organizationId: org.id,
        createdBy: ctx.userId,
        ...input,
      });
      return serializeAchievement(a, await iconUrlFor(org.id, a));
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(1000).nullable().optional(),
        iconFileId: z.string().min(1).nullable().optional(),
        points: z.number().int().min(0).max(100000).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { org } = await requireManagedAchievement(ctx, input.id);
      const { id, ...patch } = input;
      const a = await updateAchievement(id, patch);
      return serializeAchievement(a, await iconUrlFor(org.id, a));
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireManagedAchievement(ctx, input.id);
      await softDeleteAchievement(input.id);
      return { id: input.id };
    }),

  rules: router({
    create: publicProcedure
      .input(
        z.object({
          achievementId: z.string().min(1),
          eventType: z.string().trim().min(1).max(200),
          threshold: z.number().int().min(1).max(1000000).optional(),
          subjectField: z.string().trim().min(1).max(80).optional(),
          match: matchSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { org } = await requireManagedAchievement(ctx, input.achievementId);
        const rule = await createRule({
          achievementId: input.achievementId,
          organizationId: org.id,
          eventType: input.eventType,
          threshold: input.threshold,
          subjectField: input.subjectField,
          match: input.match ?? null,
        });
        return serializeRule(rule);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          eventType: z.string().trim().min(1).max(200).optional(),
          threshold: z.number().int().min(1).max(1000000).optional(),
          subjectField: z.string().trim().min(1).max(80).optional(),
          match: matchSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const rule = await findRuleById(input.id);
        if (!rule) throw new NotFoundError("AchievementRule", input.id);
        await requireManagedAchievement(ctx, rule.achievementId);
        const { id, ...patch } = input;
        const updated = await updateRule(id, patch);
        return serializeRule(updated);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const rule = await findRuleById(input.id);
        if (!rule) throw new NotFoundError("AchievementRule", input.id);
        await requireManagedAchievement(ctx, rule.achievementId);
        await deleteRule(input.id);
        return { id: input.id };
      }),
  }),

  /** The live event-type catalog (every core + extended module's registered
   *  events + their payload fields), so the rule editor can pick a trigger and
   *  its subject / match fields. Manage-gated. */
  eventTypes: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "achievements.manage", org.id);
    return listEventTypesByModule().map((group) => ({
      module: group.module,
      events: group.events.map((e) => ({
        type: e.type,
        description: e.description,
        fields: eventFieldsFor(e.type).map((f) => ({
          key: f.key,
          type: f.type,
          description: f.description,
        })),
      })),
    }));
  }),

  // ── User gallery (view) ────────────────────────────────
  catalog: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "achievements.view", org.id);
    const achievements = await listAchievements(org.id);
    const urls = await resolveIconUrls(
      org.id,
      achievements.map((a) => a.iconFileId ?? ""),
    );
    return achievements.map((a) =>
      serializeAchievement(a, a.iconFileId ? (urls.get(a.iconFileId) ?? null) : null),
    );
  }),

  /** Compact awards summary for the account-menu shell widget : earned count +
   *  the most-recent few badges (with resolved icon URLs). */
  summary: publicProcedure
    .input(z.object({ latest: z.number().int().min(1).max(6).optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "achievements.view", org.id);
      const { count, latest } = await summarizeAwardsForUser(
        org.id,
        ctx.userId,
        input?.latest ?? 3,
      );
      const urls = await resolveIconUrls(
        org.id,
        latest.map((a) => a.achievement.iconFileId ?? ""),
      );
      return {
        count,
        latest: latest.map((award) => ({
          id: award.id,
          achievementId: award.achievementId,
          name: award.achievement.name,
          iconUrl: award.achievement.iconFileId
            ? (urls.get(award.achievement.iconFileId) ?? null)
            : null,
          points: award.achievement.points,
          awardedAt: award.awardedAt,
        })),
      };
    }),

  myAwards: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "achievements.view", org.id);
    const awards = await listAwardsForUser(org.id, ctx.userId);
    const urls = await resolveIconUrls(
      org.id,
      awards.map((a) => a.achievement.iconFileId ?? ""),
    );
    return awards.map((award) => ({
      id: award.id,
      achievementId: award.achievementId,
      name: award.achievement.name,
      description: award.achievement.description,
      iconUrl: award.achievement.iconFileId
        ? (urls.get(award.achievement.iconFileId) ?? null)
        : null,
      points: award.achievement.points,
      awardedAt: award.awardedAt,
    }));
  }),

  myProgress: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "achievements.view", org.id);
    // Best progress per achievement (a single achievement may have several
    // rules — surface the furthest-along one for its progress bar).
    const rows = await listProgressForUser(org.id, ctx.userId);
    const best = new Map<
      string,
      {
        achievementId: string;
        name: string;
        iconFileId: string | null;
        points: number;
        count: number;
        threshold: number;
      }
    >();
    for (const { rule, count } of rows) {
      const ratio = count / rule.threshold;
      const prev = best.get(rule.achievementId);
      if (!prev || ratio > prev.count / prev.threshold) {
        best.set(rule.achievementId, {
          achievementId: rule.achievementId,
          name: rule.achievement.name,
          iconFileId: rule.achievement.iconFileId,
          points: rule.achievement.points,
          count: Math.min(count, rule.threshold),
          threshold: rule.threshold,
        });
      }
    }
    const entries = [...best.values()];
    const urls = await resolveIconUrls(
      org.id,
      entries.map((e) => e.iconFileId ?? ""),
    );
    return entries.map(({ iconFileId, ...e }) => ({
      ...e,
      iconUrl: iconFileId ? (urls.get(iconFileId) ?? null) : null,
    }));
  }),
});
