/**
 * Migration script to clean up junk titles and missing patent expiration dates
 *
 * This script addresses two data quality issues:
 * 1. Documents with junk titles like "<rdf:li>", "Forbes", "Nubia Pad"
 * 2. Patents missing expiration dates
 */

import { createClient } from '@/lib/supabase/server';

interface JunkTitleInfo {
  id: string;
  title: string;
  doc_type: string;
  source_url?: string;
  created_at: string;
}

interface PatentInfo {
  id: string;
  title: string;
  patent_no?: string;
  filed_date?: string;
  priority_date?: string;
  expiration_date?: string;
  expiration_is_estimate?: boolean;
}

export class JunkTitleCleanupMigration {
  private supabase = createClient();

  /**
   * Main migration function
   */
  async runMigration(): Promise<void> {
    console.log(
      '🧹 Starting junk title and patent expiration cleanup migration...'
    );

    try {
      // Step 1: Clean up junk titles
      await this.cleanupJunkTitles();

      // Step 2: Add missing patent expiration dates
      await this.addMissingPatentExpirationDates();

      console.log('✅ Migration completed successfully!');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Identify and fix documents with junk titles
   */
  private async cleanupJunkTitles(): Promise<void> {
    console.log('\n📋 Step 1: Cleaning up junk titles...');

    // Query for potential junk titles
    const { data: documents, error } = (await this.supabase
      .from('documents')
      .select('id, title, doc_type, source_url, created_at').or(`
        title.like.<rdf:li>,
        title.like.</%>,
        title.eq.Forbes,
        title.eq.Wired,
        title.eq.Nubia Pad,
        title.eq.Samsung,
        title.eq.ZTE,
        title.eq.LG,
        title.eq.Apple,
        title.like.https://%,
        title.like.http://%,
        char_length(title).lt.4
      `)) as { data: JunkTitleInfo[] | null; error: any };

    if (error) {
      throw new Error(`Failed to query junk titles: ${error.message}`);
    }

    if (!documents || documents.length === 0) {
      console.log('✅ No junk titles found to clean up.');
      return;
    }

    console.log(
      `🔍 Found ${documents.length} documents with potential junk titles:`
    );
    documents.forEach(doc => {
      console.log(`  - "${doc.title}" (${doc.doc_type}) [${doc.id}]`);
    });

    // Clean up each document
    for (const doc of documents) {
      await this.fixJunkTitle(doc);
    }

    console.log(`✅ Cleaned up ${documents.length} junk titles`);
  }

  /**
   * Fix a single document's junk title
   */
  private async fixJunkTitle(doc: JunkTitleInfo): Promise<void> {
    let newTitle: string;

    // Clean up XML/HTML tags
    const cleanedTitle = doc.title.replace(/<[^>]+>/g, '').trim();

    if (cleanedTitle && cleanedTitle !== doc.title && cleanedTitle.length > 3) {
      newTitle = cleanedTitle;
      console.log(`📝 Cleaned XML tags: "${doc.title}" → "${newTitle}"`);
    } else {
      // Generate appropriate title based on document type and URL
      newTitle = this.generateTitleFromMetadata(doc);
      console.log(`🔧 Generated new title: "${doc.title}" → "${newTitle}"`);
    }

    // Update the document
    const { error } = await this.supabase
      .from('documents')
      .update({ title: newTitle })
      .eq('id', doc.id);

    if (error) {
      console.error(`❌ Failed to update title for ${doc.id}:`, error.message);
    } else {
      console.log(`✅ Updated title for ${doc.id}`);
    }
  }

  /**
   * Generate appropriate title from document metadata
   */
  private generateTitleFromMetadata(doc: JunkTitleInfo): string {
    // For press articles, extract platform and generate descriptive title
    if (doc.doc_type === 'press-article' && doc.source_url) {
      try {
        const url = new URL(doc.source_url);
        const hostname = url.hostname.replace('www.', '');
        const platform = hostname.split('.')[0];
        const capitalizedPlatform =
          platform.charAt(0).toUpperCase() + platform.slice(1);

        // Try to extract article slug from URL
        const pathSegments = url.pathname
          .split('/')
          .filter(
            seg =>
              seg &&
              seg.length > 10 &&
              seg.includes('-') &&
              !seg.match(/^(news|articles?|posts?|blog|[0-9]{4}|[0-9]{1,2})$/)
          );

        if (pathSegments.length > 0) {
          const articleSlug = pathSegments.reduce((longest, current) =>
            current.length > longest.length ? current : longest
          );

          const titleFromSlug = articleSlug
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .substring(0, 80);

          if (titleFromSlug.length > 15) {
            return titleFromSlug;
          }
        }

        return `Article from ${capitalizedPlatform}`;
      } catch {
        return `Press Article from ${doc.created_at.split('T')[0]}`;
      }
    }

    // For papers with DOI issues
    if (doc.doc_type === 'paper') {
      return `Academic Paper from ${doc.created_at.split('T')[0]}`;
    }

    // For patents
    if (doc.doc_type === 'patent') {
      return `Patent Document from ${doc.created_at.split('T')[0]}`;
    }

    // Generic fallback
    return `Document from ${doc.created_at.split('T')[0]}`;
  }

  /**
   * Add missing patent expiration dates
   */
  private async addMissingPatentExpirationDates(): Promise<void> {
    console.log('\n📅 Step 2: Adding missing patent expiration dates...');

    // Query for patents missing expiration dates
    const { data: patents, error } = (await this.supabase
      .from('documents')
      .select(
        'id, title, patent_no, filed_date, priority_date, expiration_date, expiration_is_estimate'
      )
      .eq('doc_type', 'patent')
      .is('expiration_date', null)) as {
      data: PatentInfo[] | null;
      error: any;
    };

    if (error) {
      throw new Error(`Failed to query patents: ${error.message}`);
    }

    if (!patents || patents.length === 0) {
      console.log('✅ No patents missing expiration dates.');
      return;
    }

    console.log(`🔍 Found ${patents.length} patents missing expiration dates:`);
    patents.forEach(patent => {
      console.log(`  - "${patent.title}" (${patent.patent_no}) [${patent.id}]`);
    });

    let calculatedCount = 0;

    // Calculate expiration dates
    for (const patent of patents) {
      let expirationDate: Date | undefined;
      const isEstimate = true;

      if (patent.filed_date) {
        expirationDate = new Date(patent.filed_date);
        expirationDate.setFullYear(expirationDate.getFullYear() + 20);
        console.log(
          `📊 Calculated expiration from filing date for ${patent.patent_no}: ${expirationDate.toISOString().split('T')[0]}`
        );
      } else if (patent.priority_date) {
        expirationDate = new Date(patent.priority_date);
        expirationDate.setFullYear(expirationDate.getFullYear() + 20);
        console.log(
          `📊 Calculated expiration from priority date for ${patent.patent_no}: ${expirationDate.toISOString().split('T')[0]}`
        );
      } else {
        console.log(
          `⚠️  Cannot calculate expiration for ${patent.patent_no}: no filing or priority date`
        );
        continue;
      }

      // Update the patent
      const { error: updateError } = await this.supabase
        .from('documents')
        .update({
          expiration_date: expirationDate.toISOString().split('T')[0],
          expiration_is_estimate: isEstimate,
        })
        .eq('id', patent.id);

      if (updateError) {
        console.error(
          `❌ Failed to update expiration for ${patent.id}:`,
          updateError.message
        );
      } else {
        console.log(`✅ Added expiration date for ${patent.patent_no}`);
        calculatedCount++;
      }
    }

    console.log(
      `✅ Added expiration dates to ${calculatedCount}/${patents.length} patents`
    );
  }

  /**
   * Get summary of migration results
   */
  async getMigrationSummary(): Promise<void> {
    console.log('\n📊 Migration Summary:');

    // Count documents by type
    const { data: docCounts } = await this.supabase
      .from('documents')
      .select('doc_type, count(*)', { count: 'exact' })
      .group('doc_type');

    console.log('\nDocument counts by type:');
    docCounts?.forEach((row: any) => {
      console.log(`  - ${row.doc_type}: ${row.count}`);
    });

    // Count patents with/without expiration dates
    const { data: patentExpiration } = await this.supabase
      .from('documents')
      .select('expiration_date')
      .eq('doc_type', 'patent');

    const withExpiration =
      patentExpiration?.filter((p: any) => p.expiration_date).length || 0;
    const withoutExpiration =
      patentExpiration?.filter((p: any) => !p.expiration_date).length || 0;

    console.log('\nPatent expiration dates:');
    console.log(`  - With expiration date: ${withExpiration}`);
    console.log(`  - Missing expiration date: ${withoutExpiration}`);

    // Check for remaining potential junk titles
    const { data: potentialJunk } = await this.supabase
      .from('documents')
      .select('count(*)', { count: 'exact' })
      .or('title.like.<%>, title.like.https://%, char_length(title).lt.4');

    console.log(
      `\nPotential junk titles remaining: ${potentialJunk?.[0]?.count || 0}`
    );
  }
}

/**
 * CLI runner for the migration
 */
export async function runJunkTitleCleanupMigration(): Promise<void> {
  const migration = new JunkTitleCleanupMigration();

  try {
    await migration.runMigration();
    await migration.getMigrationSummary();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
export { JunkTitleCleanupMigration };
