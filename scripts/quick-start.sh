#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}    🚀 Recommendation Service - Quick Start${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1/5: Stopping any existing containers...${NC}"
docker-compose down 2>/dev/null || docker compose down 2>/dev/null

echo ""
echo -e "${YELLOW}📋 Step 2/5: Building Docker images...${NC}"
docker-compose build || docker compose build

echo ""
echo -e "${YELLOW}📋 Step 3/5: Starting services (MongoDB + Redis)...${NC}"
docker-compose up -d mongodb redis || docker compose up -d mongodb redis

echo ""
echo -e "${YELLOW}⏳ Waiting for databases to be ready (30 seconds)...${NC}"
sleep 30

echo ""
echo -e "${YELLOW}📋 Step 4/5: Seeding database with sample data...${NC}"
npm install --silent
npx ts-node scripts/seed.ts

echo ""
echo -e "${YELLOW}📋 Step 5/5: Starting API and Worker...${NC}"
docker-compose up -d api worker prometheus || docker compose up -d api worker prometheus

echo ""
echo -e "${YELLOW}⏳ Waiting for services to be ready (20 seconds)...${NC}"
sleep 20

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Recommendation Service is now running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📊 Service URLs:${NC}"
echo -e "   🌐 API:        http://localhost:3000"
echo -e "   📈 Metrics:    http://localhost:3000/metrics"
echo -e "   ❤️  Health:     http://localhost:3000/health"
echo -e "   📊 Prometheus: http://localhost:9090"
echo ""
echo -e "${BLUE}🔑 API Key:${NC}"
echo -e "   admin-key-docker-123"
echo ""
echo -e "${BLUE}🧪 Test Commands:${NC}"
echo -e "   ${YELLOW}# Get similar products${NC}"
echo -e "   curl -H 'x-api-key: admin-key-docker-123' http://localhost:3000/v1/products/P0001/similar"
echo ""
echo -e "   ${YELLOW}# Check health${NC}"
echo -e "   curl http://localhost:3000/health"
echo ""
echo -e "   ${YELLOW}# View logs${NC}"
echo -e "   docker-compose logs -f api"
echo ""
echo -e "${BLUE}📝 Management Commands:${NC}"
echo -e "   ${YELLOW}# Stop all services${NC}"
echo -e "   docker-compose down"
echo ""
echo -e "   ${YELLOW}# Restart services${NC}"
echo -e "   docker-compose restart"
echo ""
echo -e "   ${YELLOW}# View container status${NC}"
echo -e "   docker-compose ps"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

