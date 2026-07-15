FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@10
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY ui/package.json ui/pnpm-lock.yaml ./ui/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install && pnpm --dir ui install
COPY src/ src/
COPY ui/ ui/
ENV SKIP_ENV_VALIDATION=1
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod

FROM node:22-alpine AS runner

RUN apk --no-cache add ffmpeg curl

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

WORKDIR /app

COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs drizzle/ ./drizzle/

RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

USER nodejs

EXPOSE 3000
EXPOSE 5100/udp

CMD ["node", "dist/run.js"]
