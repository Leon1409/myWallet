# Build na natywnej architekturze runnera (amd64) — vite build nie zależy od
# architektury, więc nie trzeba emulować ARM przy kompilacji (QEMU tylko dla
# finalnego etapu, który jest lekkim node:alpine + pliki JS).
FROM --platform=$BUILDPLATFORM node:20-alpine AS build
WORKDIR /repo

# Najpierw manifesty (warstwy zależności cache'ują się w buildx)
COPY client/package.json client/package-lock.json client/
RUN cd client && npm ci
COPY client/ client/
RUN cd client && npm run build

COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY server/src/ server/src/

# Etap finalny — multi-arch (amd64 / armv7 / arm64); zależności tego projektu
# są czystym JS (bez natywnych bindingów), więc node_modules z etapu build działają wszędzie
FROM node:20-alpine
RUN apk add --no-cache jq bash
WORKDIR /app
COPY --from=build /repo/client/dist /app/client/dist
COPY --from=build /repo/server /app/server
COPY addon/run.sh /app/run.sh
RUN chmod +x /app/run.sh
WORKDIR /app/server
CMD ["/app/run.sh"]
