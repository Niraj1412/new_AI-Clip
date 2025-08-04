FROM node:22

# Install system dependencies including FFmpeg and python-is-python3
RUN apt-get update && \
    apt-get install -y \
    python3 \
    python3-pip \
    python-is-python3 \
    ffmpeg && \
    python --version && \
    ffmpeg -version && \
    rm -rf /var/lib/apt/lists/*

# Create necessary directories with proper permissions
RUN mkdir -p /app/backend/uploads && \
    mkdir -p /app/uploads && \
    mkdir -p /app/tmp && \
    mkdir -p /app/output && \
    chmod -R 777 /app/backend/uploads && \
    chmod -R 777 /app/uploads && \
    chmod -R 777 /app/tmp && \
    chmod -R 777 /app/output

WORKDIR /app

# Copy package files
COPY package*.json ./

# Add your GitHub token as a build arg (ensure it's securely provided at build time)
ARG GITHUB_TOKEN

# Configure npm with GitHub Token (conditionally handle npm registry)
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > ~/.npmrc && \
    npm config set registry https://registry.npmjs.org/ && \
    npm install --no-optional --legacy-peer-deps && \
    rm -f ~/.npmrc && \
    npm cache clean --force

# Copy application code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV UPLOADS_DIR=/app/backend/uploads
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV TEMP_DIR=/app/tmp
ENV OUTPUT_DIR=/app/output

# Expose the necessary port
EXPOSE 4001

# Start the application
CMD ["npm", "start"]
