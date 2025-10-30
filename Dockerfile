# ---- Base Node Image ----
FROM node:22

# ---- Install System Dependencies ----
RUN apt-get update && \
    apt-get install -y \
    python3 \
    python3-pip \
    python-is-python3 \
    ffmpeg \
    wget && \
    python --version && \
    ffmpeg -version && \
    rm -rf /var/lib/apt/lists/*

# ---- Create App Directories ----
RUN mkdir -p /app/backend/uploads /app/uploads /app/tmp /app/output && \
    chmod -R 777 /app/backend/uploads /app/uploads /app/tmp /app/output

WORKDIR /app

# ---- Copy Package Files ----
COPY package*.json ./

# ---- Build Arguments ----
ARG GITHUB_TOKEN

# ---- Environment Variables (Fixes youtube-dl-exec Build) ----
# Prevent youtube-dl-exec from fetching binaries during install
ENV YOUTUBE_DL_SKIP_DOWNLOAD=true
# Optional: authenticate GitHub API requests if needed
ENV GITHUB_TOKEN=${GITHUB_TOKEN}

# ---- Install Dependencies ----
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > ~/.npmrc && \
    npm config set registry https://registry.npmjs.org/ && \
    npm install --no-optional --legacy-peer-deps && \
    rm -f ~/.npmrc && \
    npm cache clean --force

# ---- Copy Source Code ----
COPY . .

# ---- Set Environment Variables ----
ENV NODE_ENV=production
ENV UPLOADS_DIR=/app/backend/uploads
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV TEMP_DIR=/app/tmp
ENV OUTPUT_DIR=/app/output
ENV PORT=4001

# ---- Expose Port ----
EXPOSE 4001

# ---- Start App ----
CMD ["npm", "start"]
