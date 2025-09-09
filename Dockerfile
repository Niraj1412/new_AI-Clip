FROM node:20-alpine

# Install ffmpeg and Python for video processing and youtube-dl-exec
RUN apk add --no-cache ffmpeg python3 py3-pip && \
    ln -sf /usr/bin/python3 /usr/bin/python

# Set working directory
WORKDIR /app

# Copy package files first (for better layer caching)
COPY package*.json ./

# Install dependencies with optimizations
RUN npm ci --legacy-peer-deps && \
    npm cache clean --force

# Copy application files
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001

# Create necessary directories with proper permissions BEFORE switching user
RUN mkdir -p /app/output && \
    mkdir -p /app/uploads && \
    mkdir -p /app/cache && \
    mkdir -p /app/Download && \
    mkdir -p /app/temp && \
    mkdir -p /tmp/clipsmart_downloads && \
    mkdir -p /tmp/clipsmart_tmp && \
    chown -R backend:nodejs /app && \
    chown -R backend:nodejs /tmp/clipsmart_downloads && \
    chown -R backend:nodejs /tmp/clipsmart_tmp

# Remove development files and clean up
RUN rm -rf node_modules/.cache && \
    rm -rf /tmp/* && \
    rm -rf /var/cache/apk/*

# Switch to non-root user
USER backend

# Expose backend port
EXPOSE 4001

# Start the backend
CMD ["npm", "start"]
