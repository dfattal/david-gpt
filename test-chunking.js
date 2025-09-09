/**
 * Direct Chunking Test
 * Tests the chunking algorithm with sample content to diagnose why 0 chunks are created
 */

// Simple token estimation function (replicated from chunking.ts)
function estimateTokens(text) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const baseCount = normalized.length / 4;
  const punctuationCount = (normalized.match(/[.!?,;:()\[\]{}'"]/g) || []).length;
  return Math.ceil(baseCount + (punctuationCount * 0.1));
}

async function testChunking() {
  console.log('🧪 Testing Chunking Algorithm\n');
  
  // Test content samples
  const testCases = [
    {
      name: "Large Document Test (actual API payload)",
      content: "This is a comprehensive test document designed to have sufficient content for proper chunking validation. The document contains multiple paragraphs and sections to thoroughly test the chunking algorithm with realistic content that meets the minimum token requirements. This first section provides background information about the testing methodology and ensures we have adequate content length. We need to reach at least 800 tokens which translates to approximately 3200 characters of meaningful text content. This paragraph continues to build up the necessary content volume. The second section of this document focuses on technical details and implementation aspects. We discuss various approaches to document processing, text analysis, and content organization. The chunking algorithm should be able to process this content effectively and create appropriate chunks that maintain semantic coherence while meeting the technical requirements. This section provides detailed explanations of the underlying processes. The third section explores advanced topics and edge cases in document processing. We examine scenarios where traditional chunking approaches might face challenges and discuss potential solutions. This includes handling of varying document structures, different content types, and optimization strategies for improved performance. The content in this section is designed to test the robustness of our chunking implementation. The fourth and final section summarizes key findings and provides recommendations for future improvements. We consolidate the insights gained from the previous sections and outline best practices for document processing workflows. This comprehensive approach ensures that our chunking algorithm can handle real-world document processing scenarios effectively while maintaining high quality output. The total content length should now be sufficient to meet all minimum requirements for successful chunk creation and validation."
    },
    {
      name: "Patent-like Content (2200+ chars)",
      content: `Multi-view display device

      ABSTRACT
      A multi-view display device comprises a display panel, a light guide plate positioned in front of the display panel, and a plurality of light sources positioned to inject light into the light guide plate. The light guide plate includes a first surface facing the display panel and a second surface opposite to the first surface. The light guide plate is configured to guide light from the light sources and to emit the light through the first surface toward the display panel. The display panel is configured to modulate the light emitted from the light guide plate to generate a plurality of view images.

      FIELD OF THE INVENTION
      The present invention relates to display devices, and more particularly to multi-view display devices that can generate multiple view images simultaneously.

      BACKGROUND
      Multi-view display devices are increasingly used in various applications including virtual reality, augmented reality, and three-dimensional displays. Traditional display devices typically generate a single view image visible from a limited viewing angle. However, many applications require the ability to display different images from different viewing angles or to multiple viewers simultaneously.

      SUMMARY OF INVENTION
      The present invention provides a multi-view display device that overcomes the limitations of conventional display technologies. The device includes innovative optical components that enable efficient generation and distribution of multiple view images with improved light efficiency and reduced optical artifacts.

      DETAILED DESCRIPTION
      The multi-view display device according to embodiments of the present invention includes several key components working in coordination to achieve superior performance. The light guide plate serves as a critical optical element that manages light distribution across multiple viewing zones. The display panel utilizes advanced modulation techniques to create distinct view images for different viewing positions. The overall system architecture ensures optimal balance between image quality and light efficiency.`
    }
  ];

  // Chunking config (updated DEFAULT_RAG_CONFIG)
  const config = {
    targetTokens: 800,
    minChunkTokens: 100,
    maxChunkTokens: 1200,
    overlapPercent: 17.5
  };

  console.log('📊 Chunking Configuration:');
  console.log(`   Target tokens: ${config.targetTokens}`);
  console.log(`   Min tokens: ${config.minChunkTokens}`);
  console.log(`   Max tokens: ${config.maxChunkTokens}`);
  console.log(`   Overlap: ${config.overlapPercent}%\n`);

  for (const testCase of testCases) {
    console.log(`🔍 Testing: ${testCase.name}`);
    console.log(`Content length: ${testCase.content.length} characters`);
    
    const estimatedTokens = estimateTokens(testCase.content);
    console.log(`Estimated tokens: ${estimatedTokens}`);
    
    // Check if content meets minimum requirements
    if (estimatedTokens < config.minChunkTokens) {
      console.log(`❌ Content too small: ${estimatedTokens} < ${config.minChunkTokens} (minimum)`);
      console.log(`   Need at least ${config.minChunkTokens * 4} characters for minimum chunk`);
    } else if (estimatedTokens <= config.maxChunkTokens) {
      console.log(`✅ Content fits in single chunk: ${config.minChunkTokens} ≤ ${estimatedTokens} ≤ ${config.maxChunkTokens}`);
    } else {
      console.log(`📝 Content needs multiple chunks: ${estimatedTokens} > ${config.maxChunkTokens}`);
      const expectedChunks = Math.ceil(estimatedTokens / config.targetTokens);
      console.log(`   Expected chunks: ~${expectedChunks}`);
    }
    
    // Simulate chunk validation
    const wouldPassValidation = (
      estimatedTokens >= config.minChunkTokens && 
      estimatedTokens <= config.maxChunkTokens &&
      testCase.content.trim().length > 0
    );
    
    console.log(`Validation result: ${wouldPassValidation ? '✅ PASS' : '❌ FAIL'}`);
    console.log(''); // Empty line for spacing
  }
}

testChunking().catch(console.error);