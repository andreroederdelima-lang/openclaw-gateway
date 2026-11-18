FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=3463
ENV HOST=0.0.0.0
ENV LLM_MOCK=

EXPOSE 3463

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "scripts/healthcheck.mjs"]

USER node

CMD ["node", "server.js"]
