FROM node:17.0.1-alpine3.13 AS build
RUN apk add --no-cache python3 make g++

WORKDIR /app
copy package.json package-lock.json ./
copy web/package.json web/package-lock.json ./web/

RUN npm ci
RUN cd web && npm ci

COPY . .
RUN npm run build
RUN NODE_ENV=production npm ci



FROM node:17.0.1-alpine3.13

ENV NODE_ENV production

WORKDIR /app
COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/bin/ ./bin/
COPY --from=build /app/ /app/package.json /app/package-lock.json ./

USER 65534
ENTRYPOINT ["node", "bin/index.js"]
CMD ["--help"]
