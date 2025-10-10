#!/bin/bash
# Development Worker Startup Script
# Runs the BullMQ worker in the background with process monitoring

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log file location
LOG_FILE="./logs/worker.log"
PID_FILE="./logs/worker.pid"

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to check if worker is already running
is_worker_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            return 0  # Worker is running
        fi
    fi
    return 1  # Worker is not running
}

# Function to start worker
start_worker() {
    if is_worker_running; then
        echo -e "${YELLOW}⚠️  Worker is already running (PID: $(cat $PID_FILE))${NC}"
        exit 0
    fi

    echo -e "${GREEN}🚀 Starting background worker...${NC}"

    # Start worker in background and capture PID
    nohup pnpm worker >> "$LOG_FILE" 2>&1 &
    WORKER_PID=$!

    # Save PID
    echo $WORKER_PID > "$PID_FILE"

    # Wait a moment and check if process started successfully
    sleep 2
    if ps -p "$WORKER_PID" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Worker started successfully (PID: $WORKER_PID)${NC}"
        echo -e "${GREEN}📋 Logs: $LOG_FILE${NC}"
        echo -e "${GREEN}🛑 Stop with: ./dev-worker.sh stop${NC}"
    else
        echo -e "${RED}❌ Failed to start worker${NC}"
        rm -f "$PID_FILE"
        exit 1
    fi
}

# Function to stop worker
stop_worker() {
    if ! is_worker_running; then
        echo -e "${YELLOW}⚠️  Worker is not running${NC}"
        exit 0
    fi

    PID=$(cat "$PID_FILE")
    echo -e "${YELLOW}🛑 Stopping worker (PID: $PID)...${NC}"

    # Send SIGTERM for graceful shutdown
    kill -SIGTERM "$PID" 2>/dev/null

    # Wait for process to stop (max 10 seconds)
    for i in {1..10}; do
        if ! ps -p "$PID" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Worker stopped successfully${NC}"
            rm -f "$PID_FILE"
            exit 0
        fi
        sleep 1
    done

    # Force kill if still running
    echo -e "${YELLOW}⚠️  Worker didn't stop gracefully, forcing...${NC}"
    kill -9 "$PID" 2>/dev/null
    rm -f "$PID_FILE"
    echo -e "${GREEN}✅ Worker stopped (forced)${NC}"
}

# Function to check worker status
check_status() {
    if is_worker_running; then
        PID=$(cat "$PID_FILE")
        echo -e "${GREEN}✅ Worker is running (PID: $PID)${NC}"

        # Show last few log lines
        if [ -f "$LOG_FILE" ]; then
            echo -e "\n${YELLOW}Recent logs:${NC}"
            tail -n 10 "$LOG_FILE"
        fi
    else
        echo -e "${RED}❌ Worker is not running${NC}"
        rm -f "$PID_FILE"
    fi
}

# Function to show logs
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        echo -e "${RED}No log file found${NC}"
        exit 1
    fi
}

# Main command handling
case "${1:-start}" in
    start)
        start_worker
        ;;
    stop)
        stop_worker
        ;;
    restart)
        stop_worker
        sleep 1
        start_worker
        ;;
    status)
        check_status
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the background worker"
        echo "  stop     - Stop the background worker"
        echo "  restart  - Restart the background worker"
        echo "  status   - Check if worker is running"
        echo "  logs     - Tail the worker logs"
        exit 1
        ;;
esac
