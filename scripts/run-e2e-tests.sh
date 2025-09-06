#!/bin/bash

# E2E Test Suite Execution Script for David-GPT
# 
# This script runs comprehensive end-to-end tests for multi-turn chat
# with context management, sequential RAG, and KG enhancement.

set -e  # Exit on any error

echo "🚀 David-GPT E2E Test Suite"
echo "============================"
echo ""

# Check if dev server is running
echo "🔍 Checking development server..."
if curl -s http://localhost:3000/api/chat > /dev/null; then
    echo "✅ Development server is running"
else
    echo "❌ Development server not accessible at localhost:3000"
    echo "   Please start the dev server with: pnpm dev"
    exit 1
fi

# Check Node.js and dependencies
echo "🔍 Checking dependencies..."
if ! command -v npx &> /dev/null; then
    echo "❌ npx not found. Please install Node.js"
    exit 1
fi

if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Run from project root."
    exit 1
fi

echo "✅ Dependencies OK"
echo ""

# Set environment for testing
export NODE_ENV=development

# Run the master test suite
echo "🧪 Executing comprehensive E2E test suite..."
echo ""

npx tsx scripts/e2e-master-test-suite.ts

# Check test results
if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 ALL TESTS PASSED!"
    echo "✅ Multi-turn chat system is working correctly"
    echo "✅ Context management validated"  
    echo "✅ Sequential RAG retrieval confirmed"
    echo "✅ Knowledge graph enhancement active"
    echo "✅ No hallucination - corpus-backed responses only"
    echo ""
    echo "📄 Detailed test report available in: scripts/e2e-test-report.md"
    echo ""
    echo "🚀 System is ready for production use!"
else
    echo ""
    echo "❌ SOME TESTS FAILED"
    echo "⚠️  Review test output and fix issues before deployment"
    echo "📄 Check test report in: scripts/e2e-test-report.md"
    exit 1
fi