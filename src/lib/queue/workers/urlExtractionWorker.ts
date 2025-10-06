/**
 * URL Extraction Worker
 * Processes URL extraction jobs (single and batch)
 */

import { Job, Worker } from 'bullmq';
import { getRedisClient } from '../redis';
import { getQueue, updateJobStatus, publishProgress } from '../jobQueue';
import { createServiceClient } from '@/lib/supabase/service';
import { UrlSingleJobData, UrlBatchJobData } from '../types';
import { analyzeUrl, normalizeIdentifier } from '@/lib/rag/extraction/urlRouter';
import { extractPatentWithGemini } from '@/lib/rag/extraction/patentGeminiExtractor';
import { formatPatentMarkdown } from '@/lib/rag/extraction/patentGeminiFormatter';
import { extractArxivFromHtml } from '@/lib/rag/extraction/arxivHtmlExtractor';
import { formatArxivAsMarkdown } from '@/lib/rag/extraction/arxivMarkdownFormatter';
import { extractGenericArticle } from '@/lib/rag/extraction/genericArticleExtractor';
import { formatGenericArticleMarkdown } from '@/lib/rag/extraction/genericArticleFormatter';
import { storeExtractedDocument } from '@/lib/rag/storage/documentStorage';
import matter from 'gray-matter';

/**
 * Process a single URL extraction
 */
export async function processSingleUrl(job: Job, data: UrlSingleJobData): Promise<void> {
  const { url, personaSlugs, userId, docType, tags, aka } = data;
  const jobId = job.id!;

  try {
    await updateJobStatus(
      jobId,
      {
        status: 'processing',
        started_at: new Date().toISOString(),
        progress: { current: 0, total: 1, message: 'Analyzing URL...' },
      },
      true // use service client
    );
    await publishProgress(
      jobId,
      { current: 0, total: 1, message: 'Analyzing URL...' },
      'processing'
    );

    // Get Gemini API key
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    // Analyze URL to determine document type
    const analysis = analyzeUrl(url);
    const finalType = docType || analysis.type;

    console.log(`\n📡 Processing URL: ${url}`);
    console.log(`   Detected type: ${analysis.type}`);
    console.log(`   Final type: ${finalType}`);
    console.log(`   Identifier: ${analysis.identifier || 'N/A'}`);

    await updateJobStatus(
      jobId,
      {
        progress: { current: 0, total: 1, message: `Extracting ${finalType}...` },
      },
      true
    );
    await publishProgress(
      jobId,
      { current: 0, total: 1, message: `Extracting ${finalType}...` },
      'processing'
    );

    let markdown: string;
    let filename: string;
    let stats: any = {
      documentType: finalType,
      identifier: analysis.identifier,
    };

    // Route to appropriate extractor
    if (finalType === 'patent') {
      if (!analysis.identifier) {
        throw new Error('Could not extract patent number from URL');
      }

      const patentData = await extractPatentWithGemini(analysis.identifier, geminiApiKey);
      markdown = await formatPatentMarkdown(patentData, personaSlugs, geminiApiKey);
      filename = `${analysis.identifier.toLowerCase()}.md`;
      stats.contentChars = markdown.length;
      stats.claims = patentData.claims.length;

    } else if (finalType === 'arxiv') {
      if (!analysis.identifier) {
        throw new Error('Could not extract ArXiv ID from URL');
      }

      const paperData = await extractArxivFromHtml(analysis.identifier, geminiApiKey);
      const formatted = formatArxivAsMarkdown(paperData, personaSlugs);
      markdown = formatted.markdown;
      filename = `${analysis.identifier.replace(/\./g, '-')}.md`;
      stats.contentChars = formatted.stats.contentChars;
      stats.sections = formatted.stats.sections;
      stats.authors = formatted.stats.authors;

    } else if (finalType === 'generic') {
      const articleData = await extractGenericArticle(analysis.extractorUrl, geminiApiKey);
      markdown = await formatGenericArticleMarkdown(articleData, personaSlugs, geminiApiKey, tags, aka);
      filename = `${normalizeIdentifier(analysis)}.md`;
      stats.contentChars = markdown.length;
      stats.sections = articleData.sections?.length || 0;

    } else {
      throw new Error(`Document type "${finalType}" not yet supported`);
    }

    // Inject tags and aka into markdown if provided
    let finalMarkdown = markdown;
    if (tags || aka) {
      const { data: frontmatter, content } = matter(markdown);

      // IMPORTANT: Preserve all existing frontmatter fields
      // Ensure personas field is not lost during stringify
      if (!frontmatter.personas) {
        frontmatter.personas = personaSlugs;
      }

      if (tags && tags.length > 0) {
        frontmatter.tags = tags;
      }

      let updatedContent = content;
      if (aka) {
        const akaLine = `**Also Known As**: ${aka}`;
        if (updatedContent.match(/^\*\*Key Terms\*\*:/m)) {
          updatedContent = updatedContent.replace(
            /(^\*\*Key Terms\*\*:.*$)/m,
            `$1\n${akaLine}`
          );
        } else {
          updatedContent = akaLine + '\n' + updatedContent;
        }
      }

      finalMarkdown = matter.stringify(updatedContent.trim(), frontmatter);
    }

    await updateJobStatus(
      jobId,
      {
        progress: { current: 0, total: 1, message: 'Storing document...' },
      },
      true
    );

    // Store document
    const supabase = createServiceClient();
    const storeResult = await storeExtractedDocument(supabase, userId, {
      markdown: finalMarkdown,
      personaSlugs,
      filename,
      extractionMetadata: {
        documentType: finalType,
        identifier: analysis.identifier,
        ...stats,
      },
    });

    if (!storeResult.success) {
      throw new Error(storeResult.error || 'Failed to store document');
    }

    console.log(`✅ Stored extracted document: ${storeResult.docId} (status: ${storeResult.status})`);

    await updateJobStatus(
      jobId,
      {
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { current: 1, total: 1, message: 'Extraction complete' },
        result_data: {
          success: true,
          docIds: [storeResult.docId!],
          storedDocuments: [
            {
              docId: storeResult.docId!,
              title: storeResult.title || filename,
              storagePath: storeResult.storagePath || '',
            },
          ],
          stats: {
            total: 1,
            successful: 1,
            failed: 0,
          },
        },
      },
      true
    );
    await publishProgress(
      jobId,
      { current: 1, total: 1, message: 'Extraction complete' },
      'completed'
    );

    console.log(`✅ Job ${jobId} completed: ${storeResult.docId}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Job ${jobId} failed:`, errorMessage);

    await updateJobStatus(
      jobId,
      {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: errorMessage,
        result_data: {
          success: false,
          error: errorMessage,
        },
      },
      true
    );
    await publishProgress(
      jobId,
      { current: 0, total: 1, message: `Failed: ${errorMessage}` },
      'failed'
    );

    throw error;
  }
}

/**
 * Process a batch URL extraction
 */
export async function processBatchUrl(job: Job, data: UrlBatchJobData): Promise<void> {
  const { urls, personaSlugs, userId } = data;
  const jobId = job.id!;
  const total = urls.length;
  const results: Array<{ url: string; success: boolean; docId?: string; error?: string }> = [];

  try {
    await updateJobStatus(
      jobId,
      {
        status: 'processing',
        started_at: new Date().toISOString(),
        progress: { current: 0, total, message: 'Starting batch extraction...' },
      },
      true
    );
    await publishProgress(
      jobId,
      { current: 0, total, message: 'Starting batch extraction...' },
      'processing'
    );

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    const supabase = createServiceClient();

    for (let i = 0; i < urls.length; i++) {
      const { url, docType, tags, aka } = urls[i];

      try {
        console.log(`\n📡 Processing URL ${i + 1}/${total}: ${url}`);

        await updateJobStatus(
          jobId,
          {
            progress: { current: i, total, message: `Extracting ${i + 1}/${total}: ${url}` },
          },
          true
        );
        await publishProgress(
          jobId,
          { current: i, total, message: `Extracting ${i + 1}/${total}` },
          'processing'
        );

        // Same extraction logic as single URL
        const analysis = analyzeUrl(url);
        const finalType = docType || analysis.type;

        let markdown: string;
        let filename: string;

        if (finalType === 'patent') {
          if (!analysis.identifier) throw new Error('Could not extract patent number');
          const patentData = await extractPatentWithGemini(analysis.identifier, geminiApiKey);
          markdown = await formatPatentMarkdown(patentData, personaSlugs, geminiApiKey);
          filename = `${analysis.identifier.toLowerCase()}.md`;

        } else if (finalType === 'arxiv') {
          if (!analysis.identifier) throw new Error('Could not extract ArXiv ID');
          const paperData = await extractArxivFromHtml(analysis.identifier, geminiApiKey);
          const formatted = formatArxivAsMarkdown(paperData, personaSlugs);
          markdown = formatted.markdown;
          filename = `${analysis.identifier.replace(/\./g, '-')}.md`;

        } else if (finalType === 'generic') {
          const articleData = await extractGenericArticle(analysis.extractorUrl, geminiApiKey);
          markdown = await formatGenericArticleMarkdown(articleData, personaSlugs, geminiApiKey, tags, aka);
          filename = `${normalizeIdentifier(analysis)}.md`;

        } else {
          throw new Error(`Document type "${finalType}" not supported`);
        }

        // Inject tags and aka
        let finalMarkdown = markdown;
        if (tags || aka) {
          const { data: frontmatter, content } = matter(markdown);
          if (tags && tags.length > 0) frontmatter.tags = tags;
          let updatedContent = content;
          if (aka) {
            const akaLine = `**Also Known As**: ${aka}`;
            if (updatedContent.match(/^\*\*Key Terms\*\*:/m)) {
              updatedContent = updatedContent.replace(/(^\*\*Key Terms\*\*:.*$)/m, `$1\n${akaLine}`);
            } else {
              updatedContent = akaLine + '\n' + updatedContent;
            }
          }
          finalMarkdown = matter.stringify(updatedContent.trim(), frontmatter);
        }

        // Store document
        const storeResult = await storeExtractedDocument(supabase, userId, {
          markdown: finalMarkdown,
          personaSlugs,
          filename,
          extractionMetadata: { documentType: finalType, identifier: analysis.identifier },
        });

        if (storeResult.success) {
          results.push({ url, success: true, docId: storeResult.docId });
          console.log(`   ✅ Stored: ${storeResult.docId}`);
        } else {
          results.push({ url, success: false, error: storeResult.error });
          console.log(`   ❌ Failed: ${storeResult.error}`);
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ url, success: false, error: errorMsg });
        console.log(`   ❌ Failed: ${errorMsg}`);
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    await updateJobStatus(
      jobId,
      {
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { current: total, total, message: `Completed: ${successful} successful, ${failed} failed` },
        result_data: {
          success: true,
          docIds: results.filter(r => r.success).map(r => r.docId!),
          stats: { total, successful, failed },
        },
      },
      true
    );
    await publishProgress(
      jobId,
      { current: total, total, message: `Completed: ${successful} successful, ${failed} failed` },
      'completed'
    );

    console.log(`✅ Batch job ${jobId} completed: ${successful}/${total} successful`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Batch job ${jobId} failed:`, errorMessage);

    await updateJobStatus(
      jobId,
      {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: errorMessage,
        result_data: { success: false, error: errorMessage },
      },
      true
    );
    await publishProgress(
      jobId,
      { current: 0, total, message: `Failed: ${errorMessage}` },
      'failed'
    );

    throw error;
  }
}

/**
 * Main job processor
 */
async function processUrlJob(job: Job): Promise<void> {
  console.log(`🔄 Processing job ${job.id} (type: ${job.name})`);

  if (job.name === 'url_single') {
    await processSingleUrl(job, job.data as UrlSingleJobData);
  } else if (job.name === 'url_batch') {
    await processBatchUrl(job, job.data as UrlBatchJobData);
  } else {
    throw new Error(`Unknown job type: ${job.name}`);
  }

  console.log(`✅ Worker completed job ${job.id}\n`);
}

/**
 * Create and configure URL extraction worker
 */
export function createUrlExtractionWorker(): Worker {
  const redis = getRedisClient();
  const queue = getQueue();

  const worker = new Worker(queue.name, processUrlJob, {
    connection: redis,
    concurrency: 2, // Process 2 URLs at a time
    removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
    removeOnFail: { count: 100 }, // Keep last 100 failed jobs
  });

  worker.on('completed', (job) => {
    console.log(`✅ URL extraction worker completed job ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ URL extraction worker failed job ${job?.id}:`, err.message);
  });

  console.log('✅ URL extraction worker started (concurrency: 2)');

  return worker;
}
