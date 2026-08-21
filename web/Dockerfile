# syntax=docker/dockerfile:1

# The web app as a long-running container, so the extension has an API to call without
# anyone remembering to `npm run dev` first.
#
# Built in three stages so the runtime image carries no toolchain and no source: `deps`
# installs, `builder` compiles, `runner` holds the standalone bundle and nothing else.
#
#   docker compose up -d --build     rebuild and restart
#   docker compose logs -f web       watch it
#
# The port published on the host is 47821 (see docker-compose.yml). Inside the container
# it is the ordinary 3000 — a container has its own address space, so there is nothing to
# gain from making the two match and one more number to keep in step if they do.

FROM node:22-alpine AS base
WORKDIR /app
# Next's musl builds want it; harmless where they don't.
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1


# --------------------------------------------------------------------------- deps
# Only the files `npm ci` actually reads, so editing a component does not reinstall
# node_modules. `prisma/` and `prisma.config.ts` come too: the `postinstall` script runs
# `prisma generate`, which fails without the schema.
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci


# ------------------------------------------------------------------------ builder
# Also the image the one-shot `migrate` service runs from — it is the only stage with the
# Prisma CLI and the migration folder in the same place.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `NEXT_PUBLIC_*` is substituted into the bundle at build time, not read at boot. Passing
# these as runtime environment does nothing, which is a genuinely confusing hour — so they
# are build arguments, wired to the same values in docker-compose.yml.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_STORE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_STORE_URL=$NEXT_PUBLIC_STORE_URL

ENV NODE_ENV=production
RUN npx prisma generate && npm run build


# ------------------------------------------------------------------------- runner
FROM base AS runner
ENV NODE_ENV=production

# Not root. The app writes nothing to disk, so it does not need to be.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
# `output: 'standalone'` traces the imports actually reached and emits a server.js plus a
# minimal node_modules. Static assets are not traced and are copied separately.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma's generated client lives at node_modules/.prisma/client, which the tracer reaches
# only through a dynamic require it cannot always follow. Copying it explicitly is the
# difference between a working image and one that throws "did not initialize yet" on the
# first query. No query-engine binary is needed with it: Prisma 7 talks to Postgres through
# the pg driver adapter, which is plain JavaScript.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
