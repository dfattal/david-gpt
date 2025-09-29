/**
 * Script to ingest the RAG sample documents
 * This will process all documents in the RAG-SAMPLES directory
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SAMPLES_DIR = '/Users/david.fattal/Documents/GitHub/david-gpt/RAG-SAMPLES';
const API_BASE = 'http://localhost:3000/api';

interface DocumentIngestion {
  title: string;
  content?: string;
  docType: string;
  patentUrl?: string;
  metadata?: any;
}

// Sample documents to process
const sampleDocuments: DocumentIngestion[] = [
  {
    title: 'Immersity (former LeiaSR) Platform FAQ',
    content: readFileSync(join(SAMPLES_DIR, 'Immersity (LeiaSR) FAQ.md'), 'utf-8'),
    docType: 'note',
    metadata: {
      category: 'faq',
      topic: 'spatial-ai',
      source: 'internal-documentation'
    }
  },
  {
    title: 'Phase Engineering in 3D Displays',
    content: readFileSync(join(SAMPLES_DIR, 'phase_eng.md'), 'utf-8'),
    docType: 'note',
    metadata: {
      category: 'technical-document',
      topic: 'display-technology',
      source: 'internal-documentation'
    }
  },
  {
    title: 'Leia Image Format (LIF) and Leia Video Format (LVF)',
    content: readFileSync(join(SAMPLES_DIR, 'LIF.md'), 'utf-8'),
    docType: 'note',
    metadata: {
      category: 'specification',
      topic: 'file-formats',
      source: 'internal-documentation'
    }
  },
  // Patents from the patent-url-list.md
  {
    title: 'Patent US11281020B2 - Switchable LC Lens Technology',
    docType: 'patent',
    patentUrl: 'https://patents.google.com/patent/US11281020B2/en?oq=WO2012038876A1',
    metadata: {
      category: 'patent',
      topic: 'display-technology',
      source: 'google-patents'
    }
  },
  {
    title: 'Patent WO2024145265A1 - Latest Patent Filing',
    docType: 'patent', 
    patentUrl: 'https://patents.google.com/patent/WO2024145265A1/en?oq=WO2024145265A1',
    metadata: {
      category: 'patent',
      topic: 'spatial-ai',
      source: 'google-patents'
    }
  }
];

export async function ingestSampleDocuments(authToken?: string): Promise<void> {
  console.log('🚀 Starting RAG sample document ingestion...');
  
  const results = [];
  
  for (const doc of sampleDocuments) {
    try {
      console.log(`📄 Processing: ${doc.title}`);
      
      const response = await fetch(`${API_BASE}/documents/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(doc)
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }
      
      const result = await response.json();
      results.push(result);
      
      console.log(`✅ ${doc.title} - Job ID: ${result.jobId}`);
      
      // Wait briefly between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Failed to process ${doc.title}:`, error);
    }
  }
  
  console.log(`\n📊 Ingestion Summary:`);
  console.log(`• Total documents: ${sampleDocuments.length}`);
  console.log(`• Successfully queued: ${results.length}`);
  console.log(`• Failed: ${sampleDocuments.length - results.length}`);
  
  if (results.length > 0) {
    console.log(`\n🔍 Monitor processing status:`);
    results.forEach(result => {
      console.log(`• ${result.document.title} - Job ID: ${result.jobId}`);
    });
  }
}

// Export for programmatic use
export { sampleDocuments };