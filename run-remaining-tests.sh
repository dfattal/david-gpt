#!/bin/bash

# RAG Test Execution Script
# This script systematically tests the remaining 18 questions from the RAG-TESTING-GUIDE.md file.

# --- Configuration ---
API_URL="http://localhost:3000/api/chat"
REPORT_FILE="rag-test-results-remaining.md"
TIMEOUT_SECONDS=60
USER_ID="test-user-$(date +%s)" # A unique user ID for the test session
PERSONA="david" # Specify the persona to be used

# --- Test Questions ---
# Extracted from DOCS/RAG-TESTING-GUIDE.md
QUESTIONS=(
    # Section 1: Products Integrating Leia Display Technology (4 questions)
    "Describe the display technology used in the ZTE Nubia Pad 3D II. How does it differ from the first-generation Nubia Pad 3D?"
    "List all known gaming devices that have integrated Leia's display technology."
    "What are the primary benefits and drawbacks of using Leia's display technology in a tablet like the Lume Pad 2?"
    "Compare the display specifications of the Lume Pad 1 and Lume Pad 2."

    # Section 2: LIF Files (Leia Image Format) (6 questions)
    "Describe the process of converting a standard 2D image into a LIF file."
    "What are the key fields in the metadata of a LIF file?"
    "Explain the difference between a 4-view LIF file and a stereo LIF file."
    "What software or APIs are available for developers to create or manipulate LIF files?"
    "How does the quality of the depth map affect the final 3D image in a LIF file?"
    "Can LIF files be viewed on non-Leia devices? If so, how?"

    # Section 3: Evolution of Leia Technology (8 questions)
    "How does the switchable Liquid Crystal (LC) display technology developed by Leia work?"
    "What were the key technological advancements that enabled the transition from DLB to the modern switchable LC displays?"
    "Compare the user experience of a DLB-based device (like the RED Hydrogen One) with a modern LC-based device (like the Nubia Pad 3D II)."
    "What is 'LeiaSR' and how does it relate to the evolution of Leia's technology?"
    "Describe the role of phase engineering in the development of Leia's switchable LC displays."
    "What are the manufacturing challenges associated with producing high-quality, large-format switchable LC lightfield displays?"
    "Explain the role of the on-device AI processor in the Samsung Odyssey 3D laptop for real-time 2D-to-3D conversion."
    "How does the implementation of Leia's technology in automotive displays, like the concept with Continental, address challenges like driver distraction?"
)

# --- Helper Functions ---

# Function to send a request to the chat API
# Disables exit on error temporarily to handle curl failures gracefully
send_request() {
    local question=$1
    local conversation_id=$2
    local response
    
    # Construct the JSON payload
    local json_payload
    json_payload=$(jq -n \
        --arg question "$question" \
        --arg convId "$conversation_id" \
        --arg persona "$PERSONA" \
        '{messages: [{role: "user", content: $question}], conversationId: $convId, persona: $persona, stream: false}')

    # Make the API call with timeout and capture HTTP status and time taken
    start_time=$(date +%s.%N)
    http_status=$(curl --silent --write-out "%{http_code}" --output response.json \
        -X POST "${API_URL}" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: ${USER_ID}" \
        --max-time ${TIMEOUT_SECONDS} \
        --data "$json_payload")
    end_time=$(date +%s.%N)
    duration=$(echo "$end_time - $start_time" | bc)
    
    # Check curl exit code for errors like timeout
    curl_exit_code=$?
    if [ $curl_exit_code -ne 0 ]; then
        if [ $curl_exit_code -eq 28 ]; then # Timeout
            echo "---
**Result:** ❌ **API Timeout**
**Details:** The request timed out after ${TIMEOUT_SECONDS} seconds.
**Performance:** ${duration}s
"
        else # Other curl error
            echo "---
**Result:** ❌ **Curl Error**
**Details:** Curl exited with code ${curl_exit_code}.
**Performance:** ${duration}s
"
        fi
        return 1
    fi

    # Check HTTP status code
    if [ "$http_status" -ne 200 ]; then
        echo "---
**Result:** ❌ **API Error**
**Details:** Received HTTP status code ${http_status}.
**Performance:** ${duration}s
**Response Body:**
\`\`\`json
$(cat response.json)
\`\`\`
"
        return 1
    fi
    
    # Process successful response
    local response_text=$(jq -r '.message' response.json)
    local citations=$(jq -r '.citations | if . == null then "[]" else . end' response.json)

    echo "---
**Result:** ✅ **Success**
**Performance:** ${duration}s
**Response:**
${response_text}

**Citations:**
\`\`\`json
${citations}
\`\`\`

**Analysis:**
*   **Factual Accuracy:** ❓ (Manual Review Required)
*   **Citation Presence & Relevance:** ❓ (Manual Review Required)
*   **Completeness:** ❓ (Manual Review Required)
*   **Technical Depth:** ❓ (Manual Review Required)
"
    return 0
}


# --- Main Execution ---

# Initialize report file
echo "# RAG System Test Results (Remaining Questions)" > "${REPORT_FILE}"
echo "Generated on: $(date)" >> "${REPORT_FILE}"
echo "" >> "${REPORT_FILE}"
echo "This report contains the results of an automated test run against the RAG system's chat API." >> "${REPORT_FILE}"
echo "" >> "${REPORT_FILE}"

# Generate a unique conversation ID for this test run
CONVERSATION_ID="test-conv-$(date +%s)-${RANDOM}"

TOTAL_TESTS=${#QUESTIONS[@]}
echo "Starting RAG test run with ${TOTAL_TESTS} questions..."
echo "Conversation ID for this run: ${CONVERSATION_ID}"
echo "Results will be saved to: ${REPORT_FILE}"
echo ""

# Loop through each question and execute the test
for i in "${!QUESTIONS[@]}"; do
    question_num=$((i + 1))
    question_text=${QUESTIONS[$i]}

    echo "---"
    echo "Executing Test ${question_num}/${TOTAL_TESTS}..."
    echo "Question: ${question_text}"

    # Append question to report
    echo "## Test ${question_num}/${TOTAL_TESTS}" >> "${REPORT_FILE}"
echo "**Question:** \`${question_text}\`" >> "${REPORT_FILE}"
    
    # Send request and capture response
    response_output=$(send_request "$question_text" "$CONVERSATION_ID")
    
    # Append response to report
    echo "${response_output}" >> "${REPORT_FILE}"
    echo "" >> "${REPORT_FILE}"

    echo "Test ${question_num} complete."
done

# Clean up temporary file
rm -f response.json

echo ""
echo "---"
echo "✅ RAG test run finished!"
echo "Full report saved to '${REPORT_FILE}'."
echo "Please manually review the report to assess the quality of the responses."
