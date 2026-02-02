ARG nodeImage=node:24-alpine

FROM $nodeImage AS build
RUN apk add --no-cache python3 make g++

WORKDIR /app
copy protocol/package.json ./protocol/
copy server/package.json ./server/
copy client/package.json ./client/
copy package.json ./
copy package-lock.json ./

RUN npm ci

COPY . .
RUN npm run build
RUN NODE_ENV=production npm ci



FROM $nodeImage

ENV NODE_ENV=production

WORKDIR /app
COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/server/dist/ ./
COPY --from=build /app/package.json /app/package-lock.json ./

ENV TERMSHARE_MODE=repeater
ENV TERMSHARE_REPEATER_BIND=0.0.0.0:8082

USER 65534
ENTRYPOINT ["node", "index.js"]
CMD []
