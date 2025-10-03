#### BASE STAGE
#### Installs moon.

FROM node:24-alpine AS base
WORKDIR /app

# Install moon binary
RUN npm install -g @moonrepo/cli

# Disable toolchain and rely on system binaries
ENV MOON_TOOLCHAIN_FORCE_GLOBALS=1

# Install pnpm
# Workaround https://github.com/moonrepo/moon/issues/2111
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack install -g pnpm

#### SKELETON STAGE
#### Scaffolds repository skeleton structures.

FROM base AS skeleton

# Copy entire repository and scaffold
COPY . .
RUN moon docker scaffold frontend

#### BUILD STAGE
#### Builds the project.

FROM base AS build

# Copy workspace configs
COPY --from=skeleton /app/.moon/docker/workspace .

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store moon docker setup

# Copy project sources
COPY --from=skeleton /app/.moon/docker/sources .

# Build the project
RUN moon run frontend:build

# Prune extraneous dependencies
RUN moon docker prune

#### START STAGE
#### Runs the project.

FROM node:24-alpine AS start

# Install tzdata and set specific timezone
RUN apk add --no-cache tzdata \
	&& cp /usr/share/zoneinfo/UTC /etc/localtime \
	&& echo "UTC" > /etc/timezone \
	&& apk del tzdata
ENV TZ=UTC

# Copy built sources
COPY --from=build /root/.proto /root/.proto

# Prod deps
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/frontend/node_modules /app/apps/frontend/node_modules

# App
COPY --from=build /app/apps/frontend/build /app/apps/frontend/build

CMD ["node", "/app/apps/frontend/build"]

