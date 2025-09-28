#!/bin/bash

# Multi-Turn Conversation Test Script
# This script implements and evaluates the test scenarios from the RAG testing guide.

# --- Configuration ---
API_URL="http://localhost:3000/api/chat"
REPORT_FILE="multiturn-test-results.md"
TIMEOUT_SECONDS=120
USER_ID="multiturn-test-user-$(date +%s)"
PERSONA="david"

# --- Helper Functions ---

# Function to send a request to the chat API
# Manages conversation history
send_request() {
    local test_name="$1"
    local question="$2"
    local conversation_id="$3"
    local turn="$4"
    local -n messages_ref=$5 # Use a nameref to the messages array

    local start_time=$(date +%s)
    
    # Append the new user message to the history
    messages_ref+=("$(jq -n --arg role "user" --arg content "$question" '{role: $role, content: $content}')")
    
    # Construct the JSON payload with the full message history
    local messages_json=$(printf '%s
' "${messages_ref[@]}" | jq -s '.')
    local json_payload
    json_payload=$(jq -n \
        --argjson messages "$messages_json" \
        --arg convId "$conversation_id" \
        --arg persona "$PERSONA" \
        '{messages: $messages, conversationId: $convId, persona: $persona, stream: false}')

    # Make the API call
    http_status=$(curl --silent --write-out "%{\http_code}" --output response.json \
        -X POST "${API_URL}" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: ${USER_ID}" \
        --max-time ${TIMEOUT_SECONDS} \
        --data "$json_payload")
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Handle curl errors
    curl_exit_code=$?
    if [ $curl_exit_code -ne 0 ]; then
        echo "---
**Result:** ❌ **Curl Error**
**Details:** Curl exited with code ${curl_exit_code}.
**Performance:** ${duration}s
" >> "${REPORT_FILE}"
        return 1
    fi

    # Handle API errors
    if [ "$http_status" -ne 200 ]; then
        echo "---
**Result:** ❌ **API Error**
**Details:** Received HTTP status code ${http_status}.
**Performance:** ${duration}s
**Response Body:**
\`\`\`json
$(cat response.json)
\`\`\`
" >> "${REPORT_FILE}"
        return 1
    fi

    # Process successful response
    local response_text=$(jq -r '.message' response.json)
    
    # Append the assistant's response to the history for the next turn
    messages_ref+=("$(jq -n --arg role "assistant" --arg content "$response_text" '{role: $role, content: $content}')")

    echo "**Turn ${turn}:**" >> "${REPORT_FILE}"
    echo "**Question:** \`${question}\`" >> "${REPORT_FILE}"
    echo "**Response:**" >> "${REPORT_FILE}"
    echo "${response_text}" >> "${REPORT_FILE}"
    echo "" >> "${REPORT_FILE}"
    echo "**Performance:** ${duration}s" >> "${REPORT_FILE}"
    echo "" >> "${REPORT_FILE}"
    
    return 0
}

# --- Test Scenarios ---

# Test 1: Conversation Continuity
test_conversation_continuity() {
    local test_name="Conversation Continuity"
    local conversation_id="test-continuity-$(date +%s)"
    local messages=()
    
    echo "### ${test_name}" >> "${REPORT_FILE}"
    echo "**Description:** A deep dive into DLB technology to test the model's ability to maintain context over several turns." >> "${REPORT_FILE}"
    echo "**Evaluation Criteria:** The model should provide increasingly detailed information about DLB, referencing previous turns." >> "${REPORT_FILE}"
    echo "" >> "${REPORT_FILE}"

    send_request "${test_name}" "What is DLB technology?" "${conversation_id}" 1 messages
    send_request "${test_name}" "What were its main limitations?" "${conversation_id}" 2 messages
    send_request "${test_name}" "How does it compare to modern LC-based displays?" "${conversation_id}" 3 messages
    send_request "${test_name}" "Summarize our conversation about DLB." "${conversation_id}" 4 messages
}

# Test 2: Context Switching Detection
test_context_switching() {
    local test_name="Context Switching Detection"
    local conversation_id="test-switching-$(date +%s)"
    local messages=()

    echo "### ${test_name}" >> "${REPORT_FILE}"
    echo "**Description:** A conversation that starts with LIF files and abruptly switches to Supabase." >> "${REPORT_FILE}"
    echo "**Evaluation Criteria:** The model should recognize the context switch and answer the Supabase question without blending information from the previous topic." >> "${REPORT_FILE}"
    echo "" >> "${REPORT_FILE}"

    send_request "${test_name}" "What is a LIF file?" "${conversation_id}" 1 messages
    send_request "${test_name}" "Now, tell me about Supabase. What is it?" "${conversation_id}" 2 messages
}

# Test 3: Related vs. Unrelated Query Routing
test_query_routing() {
    local test_name="Related vs. Unrelated Query Routing"
    local conversation_id="test-routing-$(date +%s)"
    local messages=()

    echo "### ${test_name}" >> "${REPORT_FILE}"
    echo "**Description:** A test to see how the model handles related vs. completely unrelated follow-up questions." >> "${REPORT_FILE}"
    echo "**Evaluation Criteria:** The model should be able to identify the difference between a related follow-up and a non-sequitur." >> "${REPORT_FILE}"
    echo "" >> "${REPORT_FILE}"

    send_request "${test_name}" "How do Leia's LC displays work?" "${conversation_id}" 1 messages
    send_request "${test_name}" "How does that compare to a parallax barrier display?" "${conversation_id}" 2 messages
    send_request "${test_name}" "What's the best way to cook a steak?" "${conversation_id}" 3 messages
}

# Test 4: Context Window Management
test_context_window_management() {
    local test_name="Context Window Management"
    local conversation_id="test-window-$(date +%s)"
    local messages=()

    echo "### ${test_name}" >> "${REPORT_FILE}"
    echo "**Description:** A long conversation to test the model's ability to synthesize information from the entire conversation history." >> "${REPORT_FILE}"
    echo "**Evaluation Criteria:** The final summary should accurately reflect the key points from the entire conversation." >> "${REPORT_FILE}"
    echo "" >> "${REPORT_FILE}"

    send_request "${test_name}" "Tell me about the RED Hydrogen One." "${conversation_id}" 1 messages
    send_request "${test_name}" "What were its key display features?" "${conversation_id}" 2 messages
    send_request "${test_name}" "Who was the target audience for this phone?" "${conversation_id}" 3 messages
    send_request "${test_name}" "How did its display technology evolve in later products?" "${conversation_id}" 4 messages
    send_request "${test_name}" "What is a Lume Pad?" "${conversation_id}" 5 messages
    send_request "${test_name}" "Summarize our entire conversation, starting from the RED Hydrogen One and ending with the Lume Pad." "${conversation_id}" 6 messages
}


# --- Main Execution ---

# Initialize report file
echo "# Multi-Turn Conversation Test Results" > "${REPORT_FILE}"
echo "Generated on: $(date)" >> "${REPORT_FILE}"
echo "" >> "${REPORT_FILE}"

echo "Starting multi-turn test run..."

# Run all test scenarios
test_conversation_continuity
test_context_switching
test_query_routing
test_context_window_management

# Clean up
rm -f response.json

echo "✅ Multi-turn test run finished!"
echo "Full report saved to '${REPORT_FILE}'."