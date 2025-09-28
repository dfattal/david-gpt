/**
 * Test script for metadata template system
 */

import {
  generateMetadataFooter,
  injectMetadataIntoContent,
} from './metadata-templates.js';
import type { SimpleDocumentMetadata } from './metadata-templates';

// Test data for different document types
const testPatent: SimpleDocumentMetadata = {
  title: 'Multi-view display device',
  docType: 'patent',
  patentNo: 'US11281020B2',
  inventors: ['Fetze Pijlman', 'Jan Van Der Horst'],
  assignees: ['Leia Inc'],
  originalAssignee: 'Koninklijke Philips NV',
  filedDate: '2019-01-15',
  grantedDate: '2022-03-20',
};

const testPaper: SimpleDocumentMetadata = {
  title: 'Deep Learning for 3D Object Recognition',
  docType: 'paper',
  authorsAffiliations: [
    { name: 'Alice Smith', affiliation: 'Stanford University' },
    { name: 'Bob Johnson', affiliation: 'MIT' },
  ],
  venue: 'CVPR',
  publicationYear: 2023,
  doi: '10.1109/CVPR.2023.12345',
  citationCount: 42,
};

const testBook: SimpleDocumentMetadata = {
  title: 'Computer Vision: Algorithms and Applications',
  docType: 'book',
  authorsAffiliations: [
    { name: 'Richard Szeliski', affiliation: 'Microsoft Research' },
  ],
  venue: 'Springer',
  publicationYear: 2022,
};

const testUrl: SimpleDocumentMetadata = {
  title: 'OpenAI GPT-4 Technical Report',
  docType: 'url',
  url: 'https://openai.com/research/gpt-4',
  date: '2023-03-15',
};

function runTests() {
  console.log('🧪 Testing metadata template system...\n');

  console.log('📄 Patent metadata:');
  const patentMetadata = generateMetadataFooter(testPatent);
  console.log(`"${patentMetadata}"`);
  console.log();

  console.log('📄 Paper metadata:');
  const paperMetadata = generateMetadataFooter(testPaper);
  console.log(`"${paperMetadata}"`);
  console.log();

  console.log('📄 Book metadata:');
  const bookMetadata = generateMetadataFooter(testBook);
  console.log(`"${bookMetadata}"`);
  console.log();

  console.log('📄 URL metadata:');
  const urlMetadata = generateMetadataFooter(testUrl);
  console.log(`"${urlMetadata}"`);
  console.log();

  console.log('🔗 Full content injection example (Patent):');
  const originalAbstract =
    'A multi-view display is switchable between single view and multi-view modes...';
  const enhancedAbstract = injectMetadataIntoContent(
    originalAbstract,
    testPatent
  );
  console.log('Original:', originalAbstract);
  console.log('Enhanced:', enhancedAbstract);
  console.log();

  console.log('✅ All tests completed!');
}

if (require.main === module) {
  runTests();
}

export { runTests };
