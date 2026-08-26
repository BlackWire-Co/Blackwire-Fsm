FROM node:20-alpine AS base
WORKDIR /app

# Alpine ships OpenSSL 3.x. Prisma's engine needs this present at generate
# time too, or its own auto-detection can guess wrong and fetch an engine
# built for the wrong OpenSSL version — hence also pinning binaryTargets
# in schema.prisma to linux-musl-openssl-3.0.x.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma
COPY package*.json ./

RUN apk add --no-cache openssl curl

EXPOSE 3001

# Run pending migrations then start the API on container boot.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
