#!/bin/bash

# E2E Test Runner for David-GPT
# Usage: ./scripts/run-e2e-tests.sh [--headed] [--browser=chromium|firefox|webkit] [--spec=test-file]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 David-GPT E2E Test Suite${NC}"
echo -e "${BLUE}===============================${NC}"

# Parse command line arguments
HEADED=false
BROWSER="chromium"
SPEC=""
REPORT=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --headed)
      HEADED=true
      shift
      ;;
    --browser=*)
      BROWSER="${1#*=}"
      shift
      ;;
    --spec=*)
      SPEC="${1#*=}"
      shift
      ;;
    --report)
      REPORT=true
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --headed           Run tests in headed mode (visible browser)"
      echo "  --browser=BROWSER  Run tests in specific browser (chromium|firefox|webkit)"
      echo "  --spec=FILE        Run specific test file"
      echo "  --report           Open test report after completion"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check if required tools are installed
echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ pnpm is not installed${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    pnpm install
fi

# Setup environment
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚙️  Setting up environment...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env.local
        echo "NEXTAUTH_SECRET=test-secret-for-e2e" >> .env.local
    else
        echo -e "${RED}❌ .env.example not found${NC}"
        exit 1
    fi
fi

# Install Playwright browsers if needed
echo -e "${YELLOW}🌐 Checking Playwright browsers...${NC}"
pnpm playwright install --with-deps $BROWSER

# Build the application
echo -e "${YELLOW}🔨 Building application...${NC}"
pnpm build

# Start the application in background
echo -e "${YELLOW}🚀 Starting application...${NC}"
pnpm start &
APP_PID=$!

# Wait for application to be ready
echo -e "${YELLOW}⏳ Waiting for application to be ready...${NC}"
sleep 5

# Check if app is running
if ! curl -f http://localhost:3000 &>/dev/null; then
    echo -e "${RED}❌ Application failed to start${NC}"
    kill $APP_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✅ Application is ready${NC}"

# Prepare Playwright command
PLAYWRIGHT_CMD="pnpm playwright test"

if [ "$HEADED" = true ]; then
    PLAYWRIGHT_CMD="$PLAYWRIGHT_CMD --headed"
fi

if [ "$BROWSER" != "chromium" ]; then
    PLAYWRIGHT_CMD="$PLAYWRIGHT_CMD --project=$BROWSER"
fi

if [ -n "$SPEC" ]; then
    PLAYWRIGHT_CMD="$PLAYWRIGHT_CMD $SPEC"
fi

# Run the tests
echo -e "${BLUE}🧪 Running E2E tests...${NC}"
echo -e "${BLUE}Command: $PLAYWRIGHT_CMD${NC}"
echo ""

if $PLAYWRIGHT_CMD; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    TEST_RESULT=0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    TEST_RESULT=1
fi

# Cleanup
echo -e "${YELLOW}🧹 Cleaning up...${NC}"
kill $APP_PID 2>/dev/null || true

# Open report if requested
if [ "$REPORT" = true ]; then
    echo -e "${BLUE}📊 Opening test report...${NC}"
    pnpm playwright show-report
fi

# Summary
echo ""
echo -e "${BLUE}📋 Test Summary${NC}"
echo -e "${BLUE}===============${NC}"
echo "Browser: $BROWSER"
echo "Headed: $HEADED"
if [ -n "$SPEC" ]; then
    echo "Spec: $SPEC"
else
    echo "Spec: All tests"
fi

if [ $TEST_RESULT -eq 0 ]; then
    echo -e "Result: ${GREEN}✅ PASSED${NC}"
else
    echo -e "Result: ${RED}❌ FAILED${NC}"
fi

echo ""
echo -e "${BLUE}💡 Tips:${NC}"
echo "  - Use --headed to see tests running in browser"
echo "  - Use --browser=firefox or --browser=webkit to test other browsers"
echo "  - Use --spec=auth.spec.ts to run specific test file"
echo "  - Use --report to open detailed test report"
echo "  - Check playwright-report/ for detailed results"

exit $TEST_RESULT
