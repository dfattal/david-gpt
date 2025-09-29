/**
 * Press Article Metadata Migration Script
 * 
 * Migrates existing URL documents that are actually press articles to the new
 * press-article document type with enhanced Leia technology metadata.
 */

import { createClient } from '@supabase/supabase-js';
import { leiaArticleExtractor } from './press-article-extractor';
import { injectMetadataIntoContent } from './metadata-templates';
import type { DocumentMetadata } from './types';

// Use environment variables or provide fallback values
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mnjrwjtzfjfixdjrerke.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export class PressArticleMigration {
  private supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  private pressOutletPatterns = [
    'techcrunch.com',
    'theverge.com', 
    'cnet.com',
    'engadget.com',
    'arstechnica.com',
    'wired.com',
    'gizmodo.com',
    'androidcentral.com',
    'androidpolice.com',
    '9to5google.com',
    '9to5mac.com',
    'macrumors.com',
    'tomshardware.com',
    'anandtech.com',
    'pcmag.com',
    'digitaltrends.com',
    'gsmarena.com',
    'phonearena.com',
    'androidauthority.com',
    'xda-developers.com',
    'sammobile.com',
    'samsunginsider.com',
    'displaydaily.com',
    'flatpanelshd.com',
    'avforums.com',
    'rtings.com',
    'techhive.com',
    'techradar.com',
    'zdnet.com',
    'venturebeat.com',
    'thenextweb.com',
    'mashable.com',
    'fastcompany.com',
    'businessinsider.com',
    'forbes.com',
    'reuters.com',
    'bloomberg.com',
    'wsj.com',
    'nytimes.com'
  ];

  /**
   * Identify and migrate press articles
   */
  async migrateArticles(dryRun: boolean = true): Promise<{
    processed: number;
    migrated: number;
    errors: Array<{ documentId: string; error: string }>;
  }> {
    console.log(`Starting press article migration ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
    
    const results = {
      processed: 0,
      migrated: 0,
      errors: [] as Array<{ documentId: string; error: string }>
    };

    try {
      // Get all URL documents that might be press articles
      const { data: documents, error: fetchError } = await this.supabase
        .from('documents')
        .select('*')
        .eq('doc_type', 'url')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw new Error(`Failed to fetch documents: ${fetchError.message}`);
      }

      if (!documents || documents.length === 0) {
        console.log('No URL documents found to process');
        return results;
      }

      console.log(`Found ${documents.length} URL documents to evaluate`);

      for (const doc of documents) {
        results.processed++;
        
        try {
          if (await this.shouldMigrateDocument(doc)) {
            console.log(`Document ${doc.id} (${doc.title}) is a press article candidate`);
            
            if (!dryRun) {
              await this.migrateDocument(doc);
            }
            
            results.migrated++;
            console.log(`${dryRun ? 'Would migrate' : 'Migrated'} document: ${doc.title}`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({ documentId: doc.id, error: errorMsg });
          console.error(`Error processing document ${doc.id}:`, errorMsg);
        }

        // Progress reporting
        if (results.processed % 10 === 0) {
          console.log(`Processed ${results.processed}/${documents.length} documents`);
        }
      }

      console.log(`Migration complete: ${results.migrated} articles ${dryRun ? 'identified' : 'migrated'} out of ${results.processed} processed`);
      
      if (results.errors.length > 0) {
        console.log(`${results.errors.length} errors encountered`);
      }

      return results;
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Determine if a document should be migrated to press-article type
   */
  private async shouldMigrateDocument(doc: any): Promise<boolean> {
    // Check if URL matches press outlet patterns
    if (!doc.url) return false;
    
    try {
      const hostname = new URL(doc.url).hostname.toLowerCase();
      const isNewsOutlet = this.pressOutletPatterns.some(outlet => 
        hostname.includes(outlet) || hostname.endsWith(outlet)
      );
      
      if (!isNewsOutlet) return false;

      // Additional checks for Leia technology content
      const title = doc.title || '';
      const metaTitle = doc.meta_title || '';
      
      // Look for Leia-related keywords in title or metadata
      const leiaKeywords = [
        'leia', '3d display', 'lightfield', 'holographic', 'glasses-free',
        'autostereoscopic', 'immersive display', 'depth sensing'
      ];
      
      const hasLeiaContent = leiaKeywords.some(keyword => 
        title.toLowerCase().includes(keyword) || 
        metaTitle.toLowerCase().includes(keyword)
      );

      // Also check if document content contains technology keywords
      if (!hasLeiaContent) {
        const { data: chunks, error } = await this.supabase
          .from('document_chunks')
          .select('content')
          .eq('document_id', doc.id)
          .limit(3); // Check first few chunks

        if (!error && chunks) {
          const combinedContent = chunks.map(c => c.content).join(' ').toLowerCase();
          const hasLeiaInContent = leiaKeywords.some(keyword => 
            combinedContent.includes(keyword)
          );
          
          if (hasLeiaInContent) return true;
        }
      }

      return hasLeiaContent;
      
    } catch (error) {
      console.warn(`Could not evaluate document ${doc.id} for migration:`, error);
      return false;
    }
  }

  /**
   * Migrate a single document to press-article type with enhanced metadata
   */
  private async migrateDocument(doc: any): Promise<void> {
    try {
      // Get document content for metadata extraction
      const { data: chunks, error: chunksError } = await this.supabase
        .from('document_chunks')
        .select('content')
        .eq('document_id', doc.id)
        .order('chunk_index');

      if (chunksError) {
        throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
      }

      const combinedContent = chunks?.map(c => c.content).join('\n') || '';
      
      // Extract Leia technology metadata
      const leiaMetadata = leiaArticleExtractor.extractMetadata(
        doc.title || 'Untitled Article',
        combinedContent,
        doc.url || ''
      );

      // Update document metadata
      const updateData: Partial<DocumentMetadata> = {
        docType: 'press-article',
        // Map extracted metadata to document fields
        ...(leiaMetadata.oem && { oem: leiaMetadata.oem }),
        ...(leiaMetadata.model && { model: leiaMetadata.model }),
        ...(leiaMetadata.displaySize && { displaySize: leiaMetadata.displaySize }),
        ...(leiaMetadata.displayType && { displayType: leiaMetadata.displayType }),
        ...(leiaMetadata.refreshRate && { refreshRate: leiaMetadata.refreshRate }),
        ...(leiaMetadata.leiaFeature && { leiaFeature: leiaMetadata.leiaFeature }),
        ...(leiaMetadata.productCategory && { productCategory: leiaMetadata.productCategory }),
        ...(leiaMetadata.journalist && { journalist: leiaMetadata.journalist }),
        ...(leiaMetadata.outlet && { outlet: leiaMetadata.outlet }),
        ...(leiaMetadata.launchYear && { launchYear: leiaMetadata.launchYear }),
        ...(leiaMetadata.marketRegion && { marketRegion: leiaMetadata.marketRegion }),
        ...(leiaMetadata.priceRange && { priceRange: leiaMetadata.priceRange }),
        updatedAt: new Date()
      };

      const { error: updateError } = await this.supabase
        .from('documents')
        .update(updateData)
        .eq('id', doc.id);

      if (updateError) {
        throw new Error(`Failed to update document: ${updateError.message}`);
      }

      // Update abstract chunks with metadata injection
      await this.updateChunksWithMetadata(doc.id, leiaMetadata);

      console.log(`Successfully migrated document ${doc.id} to press-article type`);
      
    } catch (error) {
      throw new Error(`Migration failed for document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update abstract chunks with injected metadata
   */
  private async updateChunksWithMetadata(documentId: string, leiaMetadata: any): Promise<void> {
    try {
      // Find abstract or first chunk
      const { data: chunks, error } = await this.supabase
        .from('document_chunks')
        .select('*')
        .eq('document_id', documentId)
        .or('section_title.ilike.%abstract%,chunk_index.eq.0')
        .order('chunk_index')
        .limit(1);

      if (error || !chunks || chunks.length === 0) {
        console.warn(`No abstract chunk found for document ${documentId}`);
        return;
      }

      const chunk = chunks[0];
      const simpleMetadata = {
        title: leiaMetadata.title,
        docType: 'press-article',
        oem: leiaMetadata.oem,
        model: leiaMetadata.model,
        displaySize: leiaMetadata.displaySize,
        displayType: leiaMetadata.displayType,
        refreshRate: leiaMetadata.refreshRate,
        leiaFeature: leiaMetadata.leiaFeature,
        productCategory: leiaMetadata.productCategory,
        journalist: leiaMetadata.journalist,
        outlet: leiaMetadata.outlet,
        launchYear: leiaMetadata.launchYear,
        marketRegion: leiaMetadata.marketRegion,
        priceRange: leiaMetadata.priceRange
      };

      const enhancedContent = injectMetadataIntoContent(chunk.content, simpleMetadata);

      // Update chunk content
      const { error: updateError } = await this.supabase
        .from('document_chunks')
        .update({
          content: enhancedContent,
          updated_at: new Date()
        })
        .eq('id', chunk.id);

      if (updateError) {
        throw new Error(`Failed to update chunk: ${updateError.message}`);
      }

    } catch (error) {
      console.warn(`Failed to update chunks for document ${documentId}:`, error);
      // Don't throw - metadata injection is nice to have but not critical
    }
  }

  /**
   * Rollback migration for a specific document
   */
  async rollbackDocument(documentId: string): Promise<void> {
    try {
      // Reset document type back to 'url' and clear press article fields
      const { error } = await this.supabase
        .from('documents')
        .update({
          doc_type: 'url',
          oem: null,
          model: null,
          display_size: null,
          display_type: null,
          refresh_rate: null,
          leia_feature: null,
          product_category: null,
          journalist: null,
          outlet: null,
          launch_year: null,
          market_region: null,
          price_range: null,
          updated_at: new Date()
        })
        .eq('id', documentId);

      if (error) {
        throw new Error(`Rollback failed: ${error.message}`);
      }

      console.log(`Successfully rolled back document ${documentId}`);

    } catch (error) {
      console.error(`Rollback failed for document ${documentId}:`, error);
      throw error;
    }
  }
}

export const pressArticleMigration = new PressArticleMigration();

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  
  pressArticleMigration.migrateArticles(dryRun)
    .then(results => {
      console.log('Migration results:', results);
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}