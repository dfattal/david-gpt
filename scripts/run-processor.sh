#!/bin/bash

# Document Processing Script Runner
# Provides safe execution of the TypeScript document processor with logging

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST_PATH="$PROJECT_ROOT/rag-processing-manifest-comprehensive.json"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/document-processing-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

check_dependencies() {
    log_info "Checking dependencies..."

    # Check if tsx is available
    if ! command -v tsx &> /dev/null; then
        if ! command -v npx &> /dev/null; then
            log_error "Neither tsx nor npx found. Please install Node.js and npm."
            exit 1
        fi
        log_warning "tsx not found globally, will use npx tsx"
        TSX_CMD="npx tsx"
    else
        TSX_CMD="tsx"
    fi

    # Check if gemini CLI is available
    if ! command -v gemini &> /dev/null; then
        log_error "Gemini CLI not found. Please install gemini CLI."
        exit 1
    fi

    # Check if manifest exists
    if [[ ! -f "$MANIFEST_PATH" ]]; then
        log_error "Manifest file not found: $MANIFEST_PATH"
        exit 1
    fi

    log_success "All dependencies checked"
}

setup_logging() {
    # Create logs directory if it doesn't exist
    mkdir -p "$LOG_DIR"

    log_info "Starting document processing pipeline"
    log_info "Manifest: $MANIFEST_PATH"
    log_info "Log file: $LOG_FILE"
    log_info "Project root: $PROJECT_ROOT"
}

run_processor() {
    log_info "Executing document processor..."

    cd "$PROJECT_ROOT"

    # Run the TypeScript processor with logging
    if $TSX_CMD "$SCRIPT_DIR/process-documents.ts" "$MANIFEST_PATH" 2>&1 | tee -a "$LOG_FILE"; then
        log_success "Document processing completed successfully"
    else
        local exit_code=$?
        log_error "Document processing failed with exit code: $exit_code"
        exit $exit_code
    fi
}

cleanup() {
    log_info "Processing pipeline finished"
    log_info "Full log available at: $LOG_FILE"
}

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --manifest)
                MANIFEST_PATH="$2"
                shift 2
                ;;
            --log-dir)
                LOG_DIR="$2"
                LOG_FILE="$LOG_DIR/document-processing-$(date +%Y%m%d-%H%M%S).log"
                shift 2
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  --manifest PATH    Path to processing manifest (default: rag-processing-manifest-comprehensive.json)"
                echo "  --log-dir PATH     Directory for log files (default: ./logs)"
                echo "  --help             Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    setup_logging
    check_dependencies
    run_processor
    cleanup
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"