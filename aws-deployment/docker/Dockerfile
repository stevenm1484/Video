# Multi-stage Dockerfile for Video Monitoring Dashboard
# This is optional - for Docker/ECS deployment

FROM python:3.11-slim as python-base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    make \
    libpq-dev \
    postgresql-client \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
COPY aws-deployment/requirements-production.txt ./
RUN pip install --no-cache-dir -r requirements-production.txt

# Copy backend code
COPY backend/ ./backend/
COPY uploads/ ./uploads/
COPY streams/ ./streams/

# Create necessary directories
RUN mkdir -p uploads streams backend/streams

# Frontend build stage
FROM node:18-alpine as frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Final stage
FROM python-base

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Create non-root user
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

USER appuser

WORKDIR /app/backend

EXPOSE 8000 2525

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/users/me || exit 1

# Run application
CMD ["gunicorn", "--config", "/app/gunicorn.conf.py", "main:app"]

