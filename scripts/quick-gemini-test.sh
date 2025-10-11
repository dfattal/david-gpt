#!/bin/bash

# Quick Gemini 2.5 Pro vs Flash comparison test
# Tests JSON formatting quality on a real ArXiv paper

echo "🧪 Quick Gemini Model Comparison Test"
echo "======================================"
echo ""

ARXIV_ID="2410.01131"
ARXIV_URL="https://arxiv.org/html/$ARXIV_ID"

echo "📄 Fetching ArXiv HTML: $ARXIV_URL"
HTML_CONTENT=$(curl -s "$ARXIV_URL" | head -c 200000)

if [ -z "$HTML_CONTENT" ]; then
  echo "❌ Failed to fetch ArXiv HTML"
  exit 1
fi

echo "✓ Fetched HTML (200KB chunk)"
echo ""

# Test prompt (same as production)
PROMPT="You are an academic paper extraction expert. Analyze this ArXiv HTML paper.

IMPORTANT INSTRUCTIONS:
1. Extract complete paper content with all sections and subsections
2. Preserve hierarchical structure (use ## for sections, ### for subsections)
3. Keep all citations in [1], [2] format intact
4. Extract metadata: title, authors with affiliations, abstract, dates
5. Generate 8-12 key technical terms
6. Generate a concise 1-2 sentence summary (under 200 chars, no line breaks)

CRITICAL JSON REQUIREMENTS:
- Escape all special characters in strings
- Do NOT include any text outside the JSON object
- Ensure all JSON strings are properly closed with quotes
- Verify all commas and braces are balanced

Return ONLY valid JSON in this exact format:
{
  \"title\": \"Paper title\",
  \"abstract\": \"Full abstract text\",
  \"content\": \"Complete paper content with ## Section headers\",
  \"authors\": [{\"name\": \"John Doe\", \"affiliation\": \"University\"}],
  \"arxivId\": \"$ARXIV_ID\",
  \"summary\": \"Brief intelligent summary here\",
  \"key_terms\": \"term1, term2, term3, term4, term5\"
}

HTML to analyze:
$HTML_CONTENT"

# Test with Gemini 2.5 Pro
echo "🤖 Testing with Gemini 2.5 Pro..."
echo ""

START_PRO=$(date +%s%3N)
PRO_RESPONSE=$(gemini -y -m gemini-2.5-pro "$PROMPT" 2>&1)
END_PRO=$(date +%s%3N)
PRO_DURATION=$((END_PRO - START_PRO))

# Validate Pro JSON
echo "$PRO_RESPONSE" | jq . > /dev/null 2>&1
if [ $? -eq 0 ]; then
  PRO_JSON_VALID="✅"
  PRO_TITLE=$(echo "$PRO_RESPONSE" | jq -r '.title // "N/A"')
  PRO_CONTENT_LENGTH=$(echo "$PRO_RESPONSE" | jq -r '.content // "" | length')
  PRO_SUMMARY=$(echo "$PRO_RESPONSE" | jq -r '.summary // "N/A"')
else
  PRO_JSON_VALID="❌"
  PRO_TITLE="PARSE_ERROR"
  PRO_CONTENT_LENGTH=0
  PRO_SUMMARY="PARSE_ERROR"
fi

echo "Results for Gemini 2.5 Pro:"
echo "  Duration: ${PRO_DURATION}ms"
echo "  JSON Valid: $PRO_JSON_VALID"
echo "  Title: $PRO_TITLE"
echo "  Content Length: $PRO_CONTENT_LENGTH chars"
echo "  Summary: $PRO_SUMMARY"
echo ""

# Test with Gemini 2.5 Flash
echo "⚡ Testing with Gemini 2.5 Flash..."
echo ""

START_FLASH=$(date +%s%3N)
FLASH_RESPONSE=$(gemini -y -m gemini-2.5-flash "$PROMPT" 2>&1)
END_FLASH=$(date +%s%3N)
FLASH_DURATION=$((END_FLASH - START_FLASH))

# Validate Flash JSON
echo "$FLASH_RESPONSE" | jq . > /dev/null 2>&1
if [ $? -eq 0 ]; then
  FLASH_JSON_VALID="✅"
  FLASH_TITLE=$(echo "$FLASH_RESPONSE" | jq -r '.title // "N/A"')
  FLASH_CONTENT_LENGTH=$(echo "$FLASH_RESPONSE" | jq -r '.content // "" | length')
  FLASH_SUMMARY=$(echo "$FLASH_RESPONSE" | jq -r '.summary // "N/A"')
else
  FLASH_JSON_VALID="❌"
  FLASH_TITLE="PARSE_ERROR"
  FLASH_CONTENT_LENGTH=0
  FLASH_SUMMARY="PARSE_ERROR"
fi

echo "Results for Gemini 2.5 Flash:"
echo "  Duration: ${FLASH_DURATION}ms"
echo "  JSON Valid: $FLASH_JSON_VALID"
echo "  Title: $FLASH_TITLE"
echo "  Content Length: $FLASH_CONTENT_LENGTH chars"
echo "  Summary: $FLASH_SUMMARY"
echo ""

# Comparison
echo "======================================"
echo "COMPARISON"
echo "======================================"
echo ""
echo "JSON Formatting:"
echo "  Pro:   $PRO_JSON_VALID"
echo "  Flash: $FLASH_JSON_VALID"
echo ""
echo "Performance:"
echo "  Pro:   ${PRO_DURATION}ms"
echo "  Flash: ${FLASH_DURATION}ms"
echo ""
echo "Content Quality:"
echo "  Pro Content:   $PRO_CONTENT_LENGTH chars"
echo "  Flash Content: $FLASH_CONTENT_LENGTH chars"
echo ""

# Recommendation
echo "======================================"
echo "💡 RECOMMENDATION"
echo "======================================"

if [ "$FLASH_JSON_VALID" == "✅" ] && [ "$PRO_JSON_VALID" == "✅" ]; then
  if [ $FLASH_DURATION -lt $PRO_DURATION ]; then
    SPEEDUP=$(echo "scale=1; $PRO_DURATION / $FLASH_DURATION" | bc)
    echo "✅ Switch to Gemini 2.5 Flash"
    echo "   - Both models produced valid JSON"
    echo "   - Flash is ${SPEEDUP}x faster"
    echo "   - Flash costs significantly less"
  else
    echo "⚠️  Keep Gemini 2.5 Pro for now"
    echo "   - Pro is faster in this test"
  fi
elif [ "$FLASH_JSON_VALID" != "✅" ]; then
  echo "❌ Keep Gemini 2.5 Pro"
  echo "   - Flash had JSON formatting issues"
  echo "   - Reliability is critical for production"
else
  echo "⚠️  Keep Gemini 2.5 Pro"
  echo "   - Pro had JSON issues (unexpected)"
fi

echo "======================================"
