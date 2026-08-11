# syntax=docker/dockerfile:1

# Monark API — production container image.
#
# Runs the api exactly the way Render's buildpack does: the full pnpm workspace
# installed, the Prisma client generated for this image's platform, and
# `tsx src/server.ts` as the entrypoint. This is the "no bundle" image — it
# trades size for reliability + parity with the proven buildpack path. A smaller
# bundled / pnpm-`deploy`-pruned image is a follow-up (see multi-instance.md).
#
# The build CONTEXT is the repo root (`app/`), not this folder, because the api
# imports the whole `@monark/*` workspace. Build + run:
#
#   docker build -f services/api/Dockerfile -t monark-api .
#   docker run --rm --env-file services/api/.env -p 4000:4000 monark-api
#
# The image is env-agnostic: it bakes in NO secrets (see .dockerignore) and runs
# NO migrations on boot. Point it at an environment purely via runtime env vars,
# and run `prisma migrate deploy` as a separate release step against that DB.

FROM node:22-slim

# Prisma's query engine needs openssl ; ca-certificates for outbound TLS to
# Supabase / SMTP / the integration REST APIs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

ENV NODE_ENV=production
ENV PORT=4000
# The root `prepare` script runs `simple-git-hooks`, which fails without a `.git`
# dir (excluded from the image). This env var makes it skip cleanly.
ENV SKIP_SIMPLE_GIT_HOOKS=1

# The base image ships a non-root `node` user ; run everything as it so a
# runtime write (e.g. the dev webhook-secret cache fallback) never needs root.
USER node
WORKDIR /home/node/app

# .dockerignore trims node_modules + build junk from the context. The committed
# generated files (schema.prisma, events.generated.ts, app-router.generated.ts)
# come along and are used as-is.
COPY --chown=node:node . .

# Full install — the api runs via `tsx`, a devDependency, so devDeps must be
# present. `@monark/db`'s postinstall runs `prisma generate` against the
# committed schema during install ; the explicit generate is belt-and-suspenders
# and pins THIS platform's query engine into the image.
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @monark/db exec prisma generate

EXPOSE 4000

# Container-level liveness (independent of any orchestrator's own check).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "api", "start:prod"]
