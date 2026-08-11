# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm --filter @frevos/control-plane deploy --prod --legacy /runtime/control-plane

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=10000
WORKDIR /opt/frevos

COPY --from=build --chown=node:node /runtime/control-plane/package.json ./control-plane/package.json
COPY --from=build --chown=node:node /runtime/control-plane/node_modules ./control-plane/node_modules
COPY --from=build --chown=node:node /workspace/apps/control-plane/dist ./control-plane/dist
COPY --from=build --chown=node:node /workspace/apps/control-plane/migrations ./control-plane/migrations
COPY --from=build --chown=node:node /workspace/apps/control-center/dist ./control-center/dist

USER node
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const port=process.env.PORT??'10000';fetch('http://127.0.0.1:'+port+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "control-plane/dist/main.js"]
