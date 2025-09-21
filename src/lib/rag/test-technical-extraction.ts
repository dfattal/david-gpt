/**
 * Test Script for Technical Document Entity Extraction
 * 
 * Tests the new technical document extraction system with the Immersity FAQ
 * to verify proper capture of technical entities like DLB, LC lens, and Leia runtime features.
 */

import { technicalDocumentEntityExtractor } from './technical-document-entity-extractor';
import type { DocumentMetadata } from './types';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Test technical document extraction with Immersity FAQ
 */
async function testTechnicalExtraction() {
  console.log('🧪 Testing Technical Document Entity Extraction\n');
  console.log('=' .repeat(80) + '\n');

  try {
    // Read the Immersity FAQ content
    const faqPath = join(process.cwd(), 'RAG-SAMPLES', 'Immersity (LeiaSR) FAQ.md');
    const content = readFileSync(faqPath, 'utf-8');
    
    console.log(`📄 Document: Immersity FAQ`);
    console.log(`📊 Content length: ${content.length} characters`);
    console.log(`📝 Content words: ${content.split(/\s+/).length} words\n`);

    // Create mock metadata
    const metadata: DocumentMetadata = {
      id: 'test-immersity-faq',
      title: 'Immersity (former LeiaSR) Platform FAQ',
      docType: 'note',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Test technical extraction
    console.log('🔬 Running technical document extraction...\n');
    const startTime = Date.now();
    
    const result = await technicalDocumentEntityExtractor.extractEntities(
      content,
      metadata
    );
    
    const extractionTime = Date.now() - startTime;
    
    // Display results
    console.log('📈 Extraction Results:');
    console.log(`⏱️  Extraction time: ${extractionTime}ms`);
    console.log(`🔢 Total entities: ${result.entities.length}`);
    console.log(`🔗 Total relationships: ${result.relationships.length}`);
    console.log(`📊 Technical term density: ${result.metadata.technicalTermDensity.toFixed(1)} per 1000 words`);
    console.log(`🎯 Average authority score: ${result.metadata.avgAuthorityScore.toFixed(2)}`);
    console.log(`❓ FAQ structure detected: ${result.metadata.faqStructureDetected ? '✅' : '❌'}\n`);

    // Check for critical technical entities
    console.log('🔍 Critical Technical Entity Detection:');
    const criticalEntities = [
      'Diffractive Lightfield Backlight',
      'DLB',
      'switchable Liquid Crystal',
      'LC lens',
      '3D Cell',
      'Stereo View Mapping',
      'Late Latching',
      'Windowed Weaving',
      'Advanced Calibration',
      'Crosstalk Mitigation'
    ];

    let foundCritical = 0;
    for (const critical of criticalEntities) {
      const found = result.entities.find(e => 
        e.name.toLowerCase().includes(critical.toLowerCase()) ||
        critical.toLowerCase().includes(e.name.toLowerCase())
      );
      
      if (found) {
        foundCritical++;
        console.log(`   ✅ ${critical}: "${found.name}" (authority: ${found.authorityScore.toFixed(2)}, mentions: ${found.mentionCount})`);
      } else {
        console.log(`   ❌ ${critical}: not found`);
      }
    }
    
    console.log(`\n📊 Critical entity coverage: ${foundCritical}/${criticalEntities.length} (${Math.round(foundCritical/criticalEntities.length*100)}%)\n`);

    // Display top entities by kind
    console.log('🏆 Top Entities by Kind:');
    const entitiesByKind = result.entities.reduce((acc, entity) => {
      if (!acc[entity.kind]) acc[entity.kind] = [];
      acc[entity.kind].push(entity);
      return acc;
    }, {} as Record<string, typeof result.entities>);

    for (const [kind, entities] of Object.entries(entitiesByKind)) {
      const sorted = entities.sort((a, b) => b.authorityScore - a.authorityScore).slice(0, 5);
      console.log(`\n   ${kind.toUpperCase()} (${entities.length} total):`);
      sorted.forEach((entity, i) => {
        console.log(`     ${i + 1}. "${entity.name}" (authority: ${entity.authorityScore.toFixed(2)}, mentions: ${entity.mentionCount})`);
      });
    }

    // Display relationships
    console.log('\n🔗 Sample Relationships:');
    result.relationships.slice(0, 10).forEach((rel, i) => {
      console.log(`   ${i + 1}. "${rel.srcName}" --${rel.relation}--> "${rel.dstName}" (confidence: ${rel.confidence.toFixed(2)})`);
    });

    // Performance analysis
    console.log('\n⚡ Performance Analysis:');
    console.log(`   Entities per second: ${Math.round(result.entities.length / (extractionTime / 1000))}`);
    console.log(`   Processing rate: ${Math.round(content.length / extractionTime)} chars/ms`);

    // Quality assessment
    console.log('\n🎯 Quality Assessment:');
    const highQualityEntities = result.entities.filter(e => e.authorityScore >= 0.7).length;
    const qualityPercentage = (highQualityEntities / result.entities.length) * 100;
    console.log(`   High quality entities (≥0.7): ${highQualityEntities}/${result.entities.length} (${qualityPercentage.toFixed(1)}%)`);
    
    const technicalEntities = result.entities.filter(e => 
      e.kind === 'technology' || e.kind === 'component'
    ).length;
    console.log(`   Technical entities: ${technicalEntities}/${result.entities.length} (${Math.round(technicalEntities/result.entities.length*100)}%)`);

    // Final assessment
    console.log('\n' + '=' .repeat(80));
    console.log('📋 Final Assessment:');
    
    const assessmentScore = (
      (foundCritical / criticalEntities.length) * 0.4 +  // 40% weight on critical entities
      (qualityPercentage / 100) * 0.3 +                   // 30% weight on quality
      (result.metadata.faqStructureDetected ? 1 : 0) * 0.3 // 30% weight on FAQ detection
    );
    
    console.log(`🎯 Overall extraction score: ${(assessmentScore * 100).toFixed(1)}%`);
    
    if (assessmentScore >= 0.9) {
      console.log('🎉 Excellent! Technical extraction working perfectly.');
    } else if (assessmentScore >= 0.7) {
      console.log('✅ Good! Technical extraction working well with minor improvements needed.');
    } else if (assessmentScore >= 0.5) {
      console.log('⚠️  Fair! Technical extraction needs significant improvements.');
    } else {
      console.log('❌ Poor! Technical extraction requires major fixes.');
    }

    return {
      success: true,
      score: assessmentScore,
      criticalEntityCoverage: foundCritical / criticalEntities.length,
      qualityPercentage: qualityPercentage / 100,
      extractionTime,
      entityCount: result.entities.length,
      relationshipCount: result.relationships.length
    };

  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Run technical extraction tests
 */
async function runTechnicalExtractionTests() {
  console.log('🚀 Technical Document Extraction Test Suite\n');
  
  try {
    const result = await testTechnicalExtraction();
    
    if (result.success) {
      console.log('\n✅ Technical extraction test completed successfully!');
    } else {
      console.log('\n❌ Technical extraction test failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTechnicalExtractionTests();
}

export { runTechnicalExtractionTests, testTechnicalExtraction };