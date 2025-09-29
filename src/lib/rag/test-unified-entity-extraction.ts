/**
 * Test Suite for Unified LLM Entity Extraction
 *
 * Comprehensive tests to validate the new LLM-based entity extraction system
 * against various document types and domains.
 */

import { unifiedLLMEntityExtractor } from './unified-llm-entity-extractor';
import { DAVID_GPT_LEIA_CONFIG, COMPUTER_VISION_CONFIG, selectConfigForDocument } from './extraction-configs';
import type { DocumentMetadata } from './types';

// =======================
// Test Data
// =======================

const SAMPLE_LEIA_DOCUMENT = `
Leia Inc. has developed a breakthrough switchable 2D/3D display technology that uses
a switchable liquid crystal (LC) cell overlay. The technology, pioneered by David Fattal
and other researchers at Leia, enables devices like the Samsung Odyssey 3D gaming monitor
to switch between high-resolution 2D mode and immersive 3D viewing without glasses.

The switchable LC component acts as a lenticular lens array when activated, creating
multiple viewing zones for autostereoscopic 3D display. When deactivated, it becomes
transparent, allowing full 2D resolution. This approach replaces Leia's earlier
diffractive lightfield backlight (DLB) technology used in devices like the Looking Glass Portrait.

Key benefits include:
- Near-lossless optical quality (~98% transmission)
- Compatibility with OLED, LCD, and MicroLED displays
- Real-time head tracking for optimal viewing experience
- Support for immersive gaming and AR interfaces
`;

const SAMPLE_CV_PAPER = `
Neural Radiance Fields (NeRF) Optimization with Gaussian Splatting

We present a novel approach to 3D scene reconstruction using Gaussian splatting
combined with neural radiance fields. Our method, implemented in PyTorch, achieves
state-of-the-art results on the NeRF Synthetic dataset and LLFF dataset.

Authors: Alice Smith (Stanford University), Bob Chen (Meta AI Research), Carol Davis (UC Berkeley)

The approach uses a transformer-based architecture to predict Gaussian parameters
for each point in 3D space. We train on the Mip-NeRF dataset and evaluate using
PSNR, SSIM, and LPIPS metrics. Our CUDA implementation achieves 10x speedup over
traditional NeRF rendering.

Key contributions:
- Real-time rendering of high-quality novel views
- Improved handling of complex lighting and materials
- Efficient GPU implementation using NVIDIA A100 hardware
`;

const SAMPLE_BUSINESS_ARTICLE = `
Samsung Electronics Announces Strategic Partnership with Leia Inc.

Samsung Electronics announced today a strategic partnership with Leia Inc. to integrate
Leia's proprietary 3D display technology into Samsung's premium gaming monitor lineup.
The collaboration will bring glasses-free 3D gaming to Samsung's Odyssey series,
starting with the Samsung Odyssey 3D gaming monitor launching in Q2 2024.

"This partnership represents a significant milestone in immersive gaming technology,"
said John Kim, VP of Display Division at Samsung Electronics. The Samsung Odyssey 3D
will feature Leia's advanced eye tracking technology and switchable LC component,
enabling seamless switching between 2D and 3D modes.

Market analysts predict the glasses-free 3D gaming monitor market will reach $2.3 billion
by 2026, driven by demand for immersive gaming experiences. TCL and LG are also
exploring similar partnerships in the autostereoscopic display space.
`;

// =======================
// Test Functions
// =======================

/**
 * Test configuration selection logic
 */
export async function testConfigurationSelection(): Promise<void> {
  console.log('🧪 Testing configuration selection...');

  // Test Leia-specific content
  const leiaConfig = selectConfigForDocument('paper', 'Switchable 3D Display Technology', SAMPLE_LEIA_DOCUMENT);
  console.assert(
    leiaConfig.focusDomains.includes('leia_technology'),
    'Should select Leia configuration for Leia content'
  );

  // Test computer vision content
  const cvConfig = selectConfigForDocument('paper', 'Neural Radiance Fields with Gaussian Splatting', SAMPLE_CV_PAPER);
  console.assert(
    cvConfig.focusDomains.includes('computer_vision'),
    'Should select CV configuration for computer vision content'
  );

  // Test press article
  const pressConfig = selectConfigForDocument('press-article', 'Samsung Partnership Announcement', SAMPLE_BUSINESS_ARTICLE);
  console.assert(
    pressConfig.focusDomains.includes('business'),
    'Should select business configuration for press articles'
  );

  console.log('✅ Configuration selection tests passed');
}

/**
 * Test entity extraction with Leia domain focus
 */
export async function testLeiaEntityExtraction(): Promise<void> {
  console.log('🧪 Testing Leia entity extraction...');

  const metadata: DocumentMetadata = {
    id: 'test-leia-doc',
    title: 'Switchable 3D Display Technology',
    docType: 'paper',
    processingStatus: 'completed',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  try {
    const extractedEntities = await unifiedLLMEntityExtractor.extractEntities(
      SAMPLE_LEIA_DOCUMENT,
      [], // No existing entities
      metadata,
      DAVID_GPT_LEIA_CONFIG
    );

    // Validate expected entities
    const entityNames = extractedEntities.map(e => e.name.toLowerCase());

    // Should extract key people
    console.assert(
      entityNames.some(name => name.includes('david fattal')),
      'Should extract David Fattal as person entity'
    );

    // Should extract organizations
    console.assert(
      entityNames.some(name => name.includes('leia')),
      'Should extract Leia Inc as organization'
    );
    console.assert(
      entityNames.some(name => name.includes('samsung')),
      'Should extract Samsung as organization'
    );

    // Should extract technologies
    console.assert(
      extractedEntities.some(e => e.type === 'technology' && e.name.toLowerCase().includes('switchable')),
      'Should extract switchable display technology'
    );

    // Should extract products
    console.assert(
      extractedEntities.some(e => e.type === 'product' && e.name.toLowerCase().includes('odyssey')),
      'Should extract Samsung Odyssey product'
    );

    // Should extract components
    console.assert(
      extractedEntities.some(e => e.type === 'component' && e.name.toLowerCase().includes('lc')),
      'Should extract LC component'
    );

    console.log(`✅ Leia extraction test passed: ${extractedEntities.length} entities extracted`);
    extractedEntities.forEach(e => {
      console.log(`  - ${e.type}: ${e.name} (confidence: ${e.confidence.toFixed(2)})`);
    });

  } catch (error) {
    console.error('❌ Leia entity extraction test failed:', error);
    throw error;
  }
}

/**
 * Test entity extraction with computer vision focus
 */
export async function testComputerVisionExtraction(): Promise<void> {
  console.log('🧪 Testing computer vision entity extraction...');

  const metadata: DocumentMetadata = {
    id: 'test-cv-doc',
    title: 'Neural Radiance Fields with Gaussian Splatting',
    docType: 'paper',
    processingStatus: 'completed',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  try {
    const extractedEntities = await unifiedLLMEntityExtractor.extractEntities(
      SAMPLE_CV_PAPER,
      [],
      metadata,
      COMPUTER_VISION_CONFIG
    );

    const entityNames = extractedEntities.map(e => e.name.toLowerCase());

    // Should extract researchers
    console.assert(
      extractedEntities.some(e => e.type === 'person' && e.name.includes('Alice Smith')),
      'Should extract Alice Smith as person'
    );

    // Should extract organizations
    console.assert(
      entityNames.some(name => name.includes('stanford')),
      'Should extract Stanford University'
    );
    console.assert(
      entityNames.some(name => name.includes('meta')),
      'Should extract Meta AI Research'
    );

    // Should extract technologies
    console.assert(
      extractedEntities.some(e => e.type === 'technology' && e.name.toLowerCase().includes('nerf')),
      'Should extract NeRF technology'
    );
    console.assert(
      extractedEntities.some(e => e.type === 'technology' && e.name.toLowerCase().includes('gaussian splatting')),
      'Should extract Gaussian Splatting'
    );

    // Should extract products/frameworks
    console.assert(
      extractedEntities.some(e => e.type === 'product' && e.name.toLowerCase().includes('pytorch')),
      'Should extract PyTorch'
    );

    console.log(`✅ CV extraction test passed: ${extractedEntities.length} entities extracted`);
    extractedEntities.forEach(e => {
      console.log(`  - ${e.type}: ${e.name} (confidence: ${e.confidence.toFixed(2)})`);
    });

  } catch (error) {
    console.error('❌ Computer vision extraction test failed:', error);
    throw error;
  }
}

/**
 * Test deduplication against existing entities
 */
export async function testDeduplication(): Promise<void> {
  console.log('🧪 Testing entity deduplication...');

  const existingEntities = [
    {
      id: '1',
      name: 'Leia Inc.',
      kind: 'organization' as const,
      description: 'Display technology company',
      authorityScore: 0.9,
      mentionCount: 5,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '2',
      name: 'Switchable 2D/3D Display Technology',
      kind: 'technology' as const,
      description: 'Display technology that can switch between 2D and 3D modes',
      authorityScore: 0.95,
      mentionCount: 3,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const metadata: DocumentMetadata = {
    id: 'test-dedup-doc',
    title: 'Test Document',
    docType: 'paper',
    processingStatus: 'completed',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  try {
    const extractedEntities = await unifiedLLMEntityExtractor.extractEntities(
      SAMPLE_LEIA_DOCUMENT,
      existingEntities,
      metadata,
      DAVID_GPT_LEIA_CONFIG
    );

    // Should not duplicate existing entities
    const extractedNames = extractedEntities.map(e => e.name.toLowerCase());
    console.assert(
      !extractedNames.includes('leia inc.'),
      'Should not duplicate existing Leia Inc entity'
    );
    console.assert(
      !extractedNames.some(name => name.includes('switchable 2d/3d display')),
      'Should not duplicate existing switchable display technology'
    );

    console.log(`✅ Deduplication test passed: ${extractedEntities.length} new entities (no duplicates)`);

  } catch (error) {
    console.error('❌ Deduplication test failed:', error);
    throw error;
  }
}

/**
 * Run all tests
 */
export async function runAllTests(): Promise<void> {
  console.log('🚀 Starting unified entity extraction tests...\n');

  try {
    await testConfigurationSelection();
    console.log('');

    await testLeiaEntityExtraction();
    console.log('');

    await testComputerVisionExtraction();
    console.log('');

    await testDeduplication();
    console.log('');

    console.log('🎉 All tests passed!');

  } catch (error) {
    console.error('💥 Test suite failed:', error);
    throw error;
  }
}

// =======================
// Standalone Test Runner
// =======================

if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}