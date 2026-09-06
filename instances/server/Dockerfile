# ArxHub headless server. The build context is the REPOSITORY ROOT, not this directory:
#   docker build -f instances/server/Dockerfile -t arxhub-server .
# The server bundle inlines every @arxhub/* workspace package from its TypeScript source (there are
# no published dist/ artifacts), so the whole monorepo has to be in the context.

FROM node:22-alpine AS build

# The repo declares no packageManager field, so the version is pinned here instead. pnpm 11 is what
# pnpm-lock.yaml and the workspace's catalogs/overrides were written against.
RUN npm install --global --no-fund --no-audit pnpm@11.9.0

WORKDIR /src
COPY . .

# Two pnpm 11 guards that protect an interactive workspace and only get in the way of a throwaway
# build container. Set on the copy inside the image, never in the repo.
#
# strictDepBuilds: pnpm 11.9 reports esbuild's build script as "ignored" and fails the install even
# though `onlyBuiltDependencies` names esbuild — the workspace also pins esbuild through `overrides`,
# which is what the allowlist stops matching against. That script only relinks a binary the platform
# package already carries, and `vite build` below is the check that it worked.
#
# verifyDepsBeforeRun: the install below is filtered, so pnpm considers the workspace incomplete and
# would re-run a full `pnpm install` in front of the build script — which walks straight back into
# the wall above.
RUN printf '\nstrictDepBuilds: false\nverifyDepsBeforeRun: false\n' >> pnpm-workspace.yaml

# `@arxhub/server...` is the server plus the workspace packages it depends on — the vue/tauri/e2e
# halves of the monorepo have no part in this artifact and installing them would double the build.
RUN pnpm install --frozen-lockfile --filter "@arxhub/server..."
RUN pnpm --filter @arxhub/server build

# `deploy` resolves the workspace links into a real, self-contained node_modules; the bundle keeps
# its npm dependencies external (elysia, pino, @noble, …) so they still have to be there at runtime.
RUN pnpm --filter @arxhub/server deploy --prod --legacy /out


FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    ARXHUB_PORT=3000 \
    ARXHUB_DATA_DIR=/data

WORKDIR /app

# Only the artifact and its runtime dependencies — no sources, no toolchain, no lockfile.
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
COPY --from=build --chown=node:node /out/package.json ./package.json

# The vault, the sync object store and the TOFU pin all live under the data dir, which is why it is a
# volume and never part of the image: an image rebuild must not be able to discard a vault, and no
# identity or pinned key is ever baked in.
RUN mkdir -p /data && chown node:node /data
VOLUME /data

USER node
EXPOSE 3000

# Node is the entrypoint rather than a shell so it gets PID 1 and its own SIGTERM handler runs —
# main.ts stops ArxHub on SIGTERM/SIGINT, and a shell in between would swallow the signal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.ARXHUB_PORT||3000)+'/healthcheck').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
