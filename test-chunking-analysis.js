// Test chunking behavior to understand CAT3D over-chunking issue

const fs = require('fs');

// Mock the chunking logic from the codebase
function estimateTokens(text) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const baseCount = normalized.length / 4;
  const punctuationCount = (normalized.match(/[.!?,;:()[\]{}'\"]/g) || []).length;
  return Math.ceil(baseCount + (punctuationCount * 0.1));
}

function analyzePotentialChunkingIssues() {
  console.log('🔍 Analyzing potential CAT3D.pdf chunking issues...\n');

  // Configuration from types.ts
  const config = {
    targetTokens: 1000,
    overlapPercent: 17.5,
    minChunkTokens: 800,
    maxChunkTokens: 1200,
  };

  const overlapTokens = Math.floor(config.targetTokens * (config.overlapPercent / 100));
  console.log(`📊 Chunking Configuration:`);
  console.log(`- Target tokens per chunk: ${config.targetTokens}`);
  console.log(`- Overlap: ${config.overlapPercent}% (${overlapTokens} tokens)`);
  console.log(`- Min/Max tokens: ${config.minChunkTokens}-${config.maxChunkTokens}\n`);

  // Analysis: What would cause 5418 chunks?
  const observedChunks = 5418;
  const expectedChunks = 15-20; // User's expectation
  
  console.log(`❌ Observed: ${observedChunks} chunks`);
  console.log(`✅ Expected: ${expectedChunks} chunks\n`);

  // Calculate implied text volume
  const avgTokensPerChunk = config.targetTokens;
  const effectiveTokensPerChunk = avgTokensPerChunk * (1 - config.overlapPercent / 100); // Account for overlap
  
  const impliedTokens = observedChunks * effectiveTokensPerChunk;
  const impliedCharacters = impliedTokens * 4; // ~4 chars per token
  const impliedPages = impliedCharacters / 2000; // ~2000 chars per page estimate
  
  console.log(`📈 Implied Text Volume from ${observedChunks} chunks:`);
  console.log(`- Total tokens: ~${Math.round(impliedTokens).toLocaleString()}`);
  console.log(`- Total characters: ~${Math.round(impliedCharacters).toLocaleString()}`);
  console.log(`- Estimated pages of text: ~${Math.round(impliedPages)}`);
  console.log(`- This is ${Math.round(observedChunks / 20)}x more than expected!\n`);

  // What should reasonable text volume look like?
  const reasonableChunks = 18; // Middle of 15-20 range
  const reasonableTokens = reasonableChunks * effectiveTokensPerChunk;
  const reasonableCharacters = reasonableTokens * 4;
  
  console.log(`📝 Expected Text Volume for ${reasonableChunks} chunks:`);
  console.log(`- Total tokens: ~${Math.round(reasonableTokens).toLocaleString()}`);
  console.log(`- Total characters: ~${Math.round(reasonableCharacters).toLocaleString()}`);
  console.log(`- This suggests a normal academic paper length\n`);

  // Potential causes analysis
  console.log(`🔍 Potential Causes of Over-Chunking:`);
  console.log(`1. **GROBID extraction issues:**`);
  console.log(`   - Extracting OCR'd text from all figures/images`);
  console.log(`   - Including repetitive headers/footers on each page`);
  console.log(`   - Not filtering bibliography/references properly`);
  console.log(`   - Including metadata, formulas, and formatting artifacts`);
  console.log(``);
  console.log(`2. **Content filtering issues:**`);
  console.log(`   - No post-GROBID cleanup of extracted text`);
  console.log(`   - Including low-value repetitive content`);
  console.log(`   - Not deduplicating similar sections`);
  console.log(``);
  console.log(`3. **PDF structure issues:**`);
  console.log(`   - CAT3D.pdf may have embedded text in images`);
  console.log(`   - Complex layout causing GROBID parsing issues`);
  console.log(`   - Large amounts of supplementary material\n`);

  // Recommendations
  console.log(`💡 Recommended Solutions:`);
  console.log(`1. **GROBID Configuration:**`);
  console.log(`   - Configure GROBID to extract only main text content`);
  console.log(`   - Skip figure captions and references if too verbose`);
  console.log(`   - Filter out headers/footers and metadata`);
  console.log(``);
  console.log(`2. **Content Post-Processing:**`);
  console.log(`   - Add content filtering after GROBID extraction`);
  console.log(`   - Remove repetitive patterns (headers/footers)`);
  console.log(`   - Deduplicate similar chunks`);
  console.log(`   - Implement maximum document size limits`);
  console.log(``);
  console.log(`3. **Chunking Strategy:**`);
  console.log(`   - Implement maximum chunks per document limit (e.g., 100-200)`);
  console.log(`   - Use larger chunk sizes for overly verbose documents`);
  console.log(`   - Implement smart section-based chunking`);
  console.log(`   - Add content quality scoring\n`);

  return {
    observedChunks,
    expectedChunks,
    impliedTokens: Math.round(impliedTokens),
    reasonableTokens: Math.round(reasonableTokens),
    config
  };
}

// Test different chunking scenarios
function simulateChunkingScenarios() {
  console.log(`🧪 Chunking Scenario Analysis:\n`);
  
  const scenarios = [
    {
      name: "Normal Academic Paper",
      content: "A" * 72000, // ~18k tokens, ~18 chunks
      expected: "15-20 chunks"
    },
    {
      name: "Over-extracted PDF (Current Issue)",
      content: "B" * 21600000, // ~5.4M tokens, ~5400 chunks  
      expected: "5418 chunks"
    },
    {
      name: "Filtered/Cleaned PDF",
      content: "C" * 100000, // ~25k tokens, ~25 chunks
      expected: "20-30 chunks"
    }
  ];

  scenarios.forEach((scenario, index) => {
    const tokens = estimateTokens(scenario.content);
    const estimatedChunks = Math.ceil(tokens / 825); // Effective tokens per chunk with overlap
    
    console.log(`${index + 1}. **${scenario.name}:**`);
    console.log(`   - Content size: ${scenario.content.length.toLocaleString()} characters`);
    console.log(`   - Estimated tokens: ${tokens.toLocaleString()}`);
    console.log(`   - Estimated chunks: ${estimatedChunks}`);
    console.log(`   - Expected: ${scenario.expected}\n`);
  });
}

// Run analysis
const results = analyzePotentialChunkingIssues();
simulateChunkingScenarios();

console.log(`📋 Summary:`);
console.log(`- The 5418 chunks suggest ~${(results.impliedTokens/1000000).toFixed(1)}M tokens of extracted text`);
console.log(`- This is ${Math.round(results.impliedTokens/results.reasonableTokens)}x larger than expected`);
console.log(`- Primary issue: GROBID extracting too much content from CAT3D.pdf`);
console.log(`- Solution: Implement content filtering and extraction controls\n`);