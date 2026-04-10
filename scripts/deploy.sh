#!/bin/bash
# ============================================
# PRESIDIUM - Production Deployment Script
# ============================================
# This script helps with production deployment
# Usage: ./scripts/deploy.sh
# ============================================

set -e

echo "🚀 PRESIDIUM Production Deployment"
echo "=================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Error: Docker is not running. Please start Docker first."
  exit 1
fi

# Check if .env.production exists
if [ ! -f .env.production ]; then
  echo "⚠️  .env.production not found!"
  echo "📝 Creating from template..."
  cp .env.production.example .env.production
  echo ""
  echo "⚠️  IMPORTANT: Edit .env.production before continuing!"
  echo "   Make sure to:"
  echo "   1. Generate secure secrets (use: openssl rand -base64 32)"
  echo "   2. Set strong database passwords"
  echo "   3. Add your API keys"
  echo ""
  read -p "Press Enter after you've edited .env.production..."
fi

# Generate secrets if not set
if grep -q "changeme" .env.production; then
  echo "⚠️  Warning: Some values still use default 'changeme'"
  echo "   This is OK for testing but NOT for production!"
fi

echo ""
echo "📦 Building and starting services..."
docker compose up -d --build

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo ""
echo "🔍 Checking service status..."
docker compose ps

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Services available at:"
echo "  🌐 App:     http://localhost:3000"
echo "  🔀 Relay:   http://localhost:3001"
echo "  💾 MinIO:   http://localhost:9001"
echo "  🗄️  DB:      localhost:5432"
echo "  🔄 Redis:   localhost:6379"
echo ""
echo "View logs with: docker compose logs -f [app|relay|db]"
echo "Stop with:      docker compose down"
