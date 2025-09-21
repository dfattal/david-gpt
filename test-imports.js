/**
 * Test imports to identify hanging issues
 */

console.log('Testing imports...');

async function testImports() {
  try {
    console.log('1. Testing generic-ingestion-adapter import...');
    const adapter = await import('./src/lib/rag/generic-ingestion-adapter.ts');
    console.log('✅ generic-ingestion-adapter imported successfully');

    console.log('2. Testing rich-metadata-chunks import...');
    const chunks = await import('./src/lib/rag/rich-metadata-chunks.ts');
    console.log('✅ rich-metadata-chunks imported successfully');

    console.log('3. Testing document-type-registry import...');
    const registry = await import('./src/lib/rag/document-type-registry.ts');
    console.log('✅ document-type-registry imported successfully');

    console.log('4. Testing enhanced-ingestion-service import...');
    const enhanced = await import('./src/lib/rag/enhanced-ingestion-service.ts');
    console.log('✅ enhanced-ingestion-service imported successfully');

    console.log('🎉 All imports successful!');
  } catch (error) {
    console.error('❌ Import failed:', error);
  }
}

testImports().catch(console.error);