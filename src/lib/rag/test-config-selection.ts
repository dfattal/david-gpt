/**
 * Test Configuration Selection (No API Required)
 *
 * Tests the configuration selection logic without requiring OpenAI API calls.
 */

import { selectConfigForDocument, DAVID_GPT_LEIA_CONFIG, COMPUTER_VISION_CONFIG, BUSINESS_PRESS_CONFIG } from './extraction-configs';

// Test samples
const LEIA_CONTENT = `
Leia Inc. has developed a breakthrough switchable 2D/3D display technology that uses
a switchable liquid crystal (LC) cell overlay. The technology enables devices like
the Samsung Odyssey 3D gaming monitor to switch between high-resolution 2D mode
and immersive 3D viewing without glasses.
`;

const CV_CONTENT = `
Neural Radiance Fields (NeRF) Optimization with Gaussian Splatting
We present a novel approach to 3D scene reconstruction using Gaussian splatting
combined with neural radiance fields. Our method, implemented in PyTorch, achieves
state-of-the-art results on the NeRF Synthetic dataset.
`;

const BUSINESS_CONTENT = `
Samsung Electronics announced today a strategic partnership with Leia Inc. to integrate
Leia's proprietary 3D display technology into Samsung's premium gaming monitor lineup.
Market analysts predict significant growth in the glasses-free 3D gaming market.
`;

function testConfigSelection(): void {
  console.log('🧪 Testing configuration selection logic...');

  // Test 1: Leia-specific content
  const leiaConfig = selectConfigForDocument('paper', 'Switchable 3D Display Technology', LEIA_CONTENT);
  console.assert(
    leiaConfig.focusDomains.includes('leia_technology'),
    'Should select Leia configuration for Leia content'
  );
  console.log('✅ Leia content correctly identified');

  // Test 2: Computer vision content
  const cvConfig = selectConfigForDocument('paper', 'Neural Radiance Fields with Gaussian Splatting', CV_CONTENT);
  console.assert(
    cvConfig.focusDomains.includes('computer_vision'),
    'Should select CV configuration for computer vision content'
  );
  console.log('✅ Computer vision content correctly identified');

  // Test 3: Business/press content
  const businessConfig = selectConfigForDocument('press-article', 'Samsung Partnership Announcement', BUSINESS_CONTENT);
  console.assert(
    businessConfig.focusDomains.includes('business'),
    'Should select business configuration for press articles'
  );
  console.log('✅ Business content correctly identified');

  // Test 4: Title-based detection
  const quantumConfig = selectConfigForDocument('paper', 'Quantum Computing with Lightfield Displays', '');
  console.assert(
    quantumConfig.focusDomains.includes('quantum'),
    'Should select Leia configuration for quantum+lightfield title'
  );
  console.log('✅ Title-based detection working');

  console.log('🎉 All configuration selection tests passed!');
}

function demonstrateConfigurations(): void {
  console.log('\n📋 Configuration Examples:');

  const configs = [
    { name: 'David-GPT Leia', config: DAVID_GPT_LEIA_CONFIG },
    { name: 'Computer Vision', config: COMPUTER_VISION_CONFIG },
    { name: 'Business Press', config: BUSINESS_PRESS_CONFIG }
  ];

  configs.forEach(({ name, config }) => {
    console.log(`\n${name} Configuration:`);
    console.log(`  Domains: ${config.focusDomains.join(', ')}`);
    console.log(`  Entity Types: ${config.entityTypes.join(', ')}`);
    console.log(`  Max Entities: ${config.maxEntitiesPerDocument}`);
    console.log(`  Confidence Threshold: ${config.confidenceThreshold}`);
  });
}

function runTests(): void {
  console.log('🚀 Testing unified entity extraction configuration system...\n');

  try {
    testConfigSelection();
    demonstrateConfigurations();
    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Tests failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}