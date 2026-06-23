# ==========================================
# STAGE 1: Install dependencies and build the app
# ==========================================
FROM node:20-slim AS builder
WORKDIR /app

# Install build-essential or generic dependencies if any node_modules require compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package configuration files
COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for the build step)
RUN npm ci

# Copy the rest of the application files
COPY . .

# Disable Next.js telemetry during the build to speed it up and maintain privacy
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js production bundle
RUN npm run build

# ==========================================
# STAGE 2: Create the lean production runtime
# ==========================================
FROM node:20-slim AS runner
WORKDIR /app

# 🛠️ CRITICAL FIX: Install procps so the 'ps' utility is available to Crawlee.
# This completely bypasses the serverless 'spawn ps ENOENT' deployment error.
RUN apt-get update && apt-get install -y procps && rm -rf /var/lib/apt/lists/*

# Establish a secure production environment variable state
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Copy necessary configuration metadata from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/next.config.mjs ./next.config.js || COPY --from=builder /app/next.config.js ./

# Copy the standalone production public directory and built application layers
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next

# Install ONLY production dependencies to keep the final container small
RUN npm ci --only=production

# Expose port 3000 for network routing on platforms like Railway or Render
EXPOSE 3000

# Fire up the production Next.js server engine
CMD ["npm", "start"]