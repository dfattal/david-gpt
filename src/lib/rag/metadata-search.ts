/**
 * Metadata-Aware Search System
 *
 * Handles structured queries that target document metadata rather than content chunks.
 * Solves the RAG retrieval failure issue where structured data (inventors, authors, dates)
 * is stored in database fields but not in searchable text chunks.
 */

import { createClient } from '@supabase/supabase-js';
import type { SearchResult, DocumentMetadata } from './types';
import { isDavidFattal } from './name-normalization';
import { technologyTermExpander } from './technology-term-expander';

// Helper functions for generic schema compatibility
function getDocumentIdentifier(doc: any): string {
  if (doc.identifiers) {
    return (
      doc.identifiers.patent_no ||
      doc.identifiers.doi ||
      doc.identifiers.arxiv_id ||
      doc.identifiers.url ||
      'Document'
    );
  }
  // Fallback to legacy fields
  return doc.patent_no || doc.doi || doc.arxiv_id || 'Document';
}

function getPatentNumber(doc: any): string | null {
  if (doc.identifiers?.patent_no) return doc.identifiers.patent_no;
  return doc.patent_no || null;
}

function getDoi(doc: any): string | null {
  if (doc.identifiers?.doi) return doc.identifiers.doi;
  return doc.doi || null;
}

function getFiledDate(doc: any): string | null {
  if (doc.dates?.filed) return doc.dates.filed;
  return doc.filed_date || null;
}

function getGrantedDate(doc: any): string | null {
  if (doc.dates?.granted) return doc.dates.granted;
  return doc.granted_date || null;
}

function getPublishedDate(doc: any): string | null {
  if (doc.dates?.published) return doc.dates.published;
  return doc.published_date || null;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Enhanced metadata query patterns with personal context awareness
const METADATA_QUERY_PATTERNS = {
  inventors:
    /(?:who (?:are|is) (?:the )?)?(?:inventor|author|creator)s?(?:\s+(?:of|for))?/i,
  authors:
    /(?:who (?:are|is) (?:the )?)?(?:author|writer|researcher)s?(?:\s+(?:of|for))?/i,
  assignee:
    /(?:who (?:is|owns|assigned) (?:the )?)?(?:assignee|owner|company|organization)(?:\s+(?:of|for))?/i,
  dates:
    /(?:when (?:was|is) (?:it|this)? ?)?(?:filed|published|granted|dated|created)(?:\s+(?:on|at|in))?/i,
  venue:
    /(?:where (?:was|is) (?:it|this)? ?)?(?:published|presented|venue|journal|conference)(?:\s+(?:in|at))?/i,
  citation: /(?:how many )?(?:citation|reference)s?(?:\s+(?:does|has|count))?/i,
  // New patterns for personal patent/paper queries
  personal_patents:
    /(?:what|which|list)?\s*(?:are\s+)?(?:your|my|david\s*fattal'?s?)\s+(?:important\s+|key\s+|main\s+)?(?:patents?|inventions?)|(?:what|which)\s+(?:important\s+|key\s+|main\s+)?(?:patents?|inventions?)\s+(?:do\s+)?(?:you|david\s*fattal)\s+(?:have|hold|own)/i,
  personal_papers:
    /(?:what|which|list)?\s*(?:are\s+)?(?:your|my|david\s*fattal'?s?)\s+(?:important\s+|key\s+|main\s+)?(?:papers?|publications?|articles?)|(?:what|which)\s+(?:important\s+|key\s+|main\s+)?(?:papers?|publications?|articles?)\s+(?:do\s+)?(?:you|david\s*fattal)\s+(?:have|hold|publish)/i,
  david_fattal_specific: /david\s*a?\.?.\s*fattal/i,
  // Technology-specific patterns
  technology_query:
    /(?:switchable\s*(?:lc|liquid\s*crystal|display)|lightfield|3d\s*display|glasses[-\s]?free|autostereoscopic|lenticular|multi[-\s]?view)/i,
  display_technology:
    /(?:display\s*technology|lcd\s*display|oled|led\s*display|screen\s*technology)/i,
  optical_technology:
    /(?:optical|optics|photonic|lens|waveguide|holographic|diffractive)/i,
};

interface MetadataQueryResult {
  isMetadataQuery: boolean;
  queryType?: string;
  targetDocuments?: DocumentMetadata[];
  structuredResponse?: string;
}

/**
 * Detect if a query is targeting structured metadata with technology awareness
 */
export function detectMetadataQuery(query: string): {
  isMetadata: boolean;
  type?: string;
  isPersonal?: boolean;
  technologyTerms?: string[];
  expandedQuery?: string;
} {
  console.log(`🔍 detectMetadataQuery called with: "${query}"`);
  const lowercaseQuery = query.toLowerCase();

  // PRIORITY 1: Enhanced technology detection for metadata queries
  // This should run FIRST to catch technology-aware metadata queries
  console.log(`🤖 Running enhanced technology detection...`);
  const techAnalysis = technologyTermExpander.detectTechnologyPatterns(query);
  console.log(
    `🎯 Technology analysis: hasTech=${techAnalysis.hasTechnologyTerms}, confidence=${techAnalysis.confidence}, domains=${techAnalysis.domains?.join(', ')}`
  );

  if (techAnalysis.hasTechnologyTerms && techAnalysis.confidence > 0.6) {
    // Check if it's asking about metadata (who, when, what, where)
    const metadataIndicators = /\b(?:who|when|what|where|which|how many)\b/i;
    console.log(
      `📋 Checking metadata indicators: ${metadataIndicators.test(query)}`
    );

    if (metadataIndicators.test(query)) {
      const expandedTerms = technologyTermExpander.generateSearchTerms(query);
      console.log(
        `🔧 Enhanced metadata query detected with terms: ${expandedTerms.join(', ')}`
      );

      return {
        isMetadata: true,
        type: 'technology_metadata',
        isPersonal: false,
        technologyTerms: expandedTerms,
        expandedQuery: expandedTerms.join(' OR '),
      };
    }
  }

  // PRIORITY 2: Check existing patterns (but only if no technology enhancement applied)
  for (const [type, pattern] of Object.entries(METADATA_QUERY_PATTERNS)) {
    if (pattern.test(lowercaseQuery)) {
      console.log(`✅ Pattern matched: ${type}`);
      const isPersonal =
        type === 'personal_patents' ||
        type === 'personal_papers' ||
        type === 'david_fattal_specific';

      // If it's a technology query, enhance with term expansion
      if (
        type === 'technology_query' ||
        type === 'display_technology' ||
        type === 'optical_technology'
      ) {
        const techAnalysis =
          technologyTermExpander.detectTechnologyPatterns(query);
        const expandedTerms = technologyTermExpander.generateSearchTerms(query);
        console.log(
          `🔧 Technology terms expanded: ${expandedTerms.join(', ')}`
        );

        return {
          isMetadata: true,
          type,
          isPersonal,
          technologyTerms: expandedTerms,
          expandedQuery: expandedTerms.join(' OR '),
        };
      }

      return { isMetadata: true, type, isPersonal };
    }
  }

  console.log(`❌ No metadata query detected`);
  return { isMetadata: false };
}

/**
 * Retrieve documents from conversation context for metadata queries
 */
async function getContextualDocuments(
  conversationId?: string,
  supabaseClient?: any
): Promise<DocumentMetadata[]> {
  if (!conversationId) return [];

  const client = supabaseClient || supabase;

  try {
    // Get recent sources from conversation context
    const { data: sources, error } = await client
      .from('conversation_sources')
      .select(
        `
        document_id,
        documents!inner (
          id, title, doc_type, identifiers, dates,
          inventors, assignees, original_assignee,
          authors_affiliations, venue, publication_year,
          filed_date, granted_date, published_date,
          citation_count, keywords, abstract
        )
      `
      )
      .eq('conversation_id', conversationId)
      .order('last_used_at', { ascending: false })
      .limit(5);

    if (error || !sources) return [];

    return sources.map((s: any) => s.documents).filter(Boolean);
  } catch (error) {
    console.error('Error fetching contextual documents:', error);
    return [];
  }
}

/**
 * Retrieve documents by IDs for metadata queries
 */
async function getDocumentsByIds(
  documentIds: string[],
  supabaseClient?: any
): Promise<DocumentMetadata[]> {
  if (!documentIds || documentIds.length === 0) return [];

  const client = supabaseClient || supabase;

  try {
    console.log(
      `🔍 Fetching ${documentIds.length} documents by IDs for metadata search`
    );

    const { data: documents, error } = await client
      .from('documents')
      .select(
        `
        id, title, doc_type, identifiers, dates,
        inventors, assignees, original_assignee,
        authors_affiliations, venue, publication_year,
        filed_date, granted_date, published_date,
        citation_count, keywords, abstract
      `
      )
      .in('id', documentIds);

    if (error) {
      console.error('Error fetching documents by IDs:', error);
      return [];
    }

    console.log(
      `✅ Retrieved ${documents?.length || 0} documents for metadata search`
    );
    return documents || [];
  } catch (error) {
    console.error('Error fetching documents by IDs:', error);
    return [];
  }
}

/**
 * Generate structured response for inventor queries
 */
function generateInventorResponse(documents: DocumentMetadata[]): string {
  const results: string[] = [];

  for (const doc of documents) {
    let inventors: string[] = [];

    // First, try the new actors.inventors format
    if (
      (doc as any).actors?.inventors &&
      Array.isArray((doc as any).actors.inventors)
    ) {
      const actorInventors = (doc as any).actors.inventors;
      console.log(
        `📄 Found actors.inventors: ${JSON.stringify(actorInventors)}`
      );

      // Handle both string array and object array formats
      inventors = actorInventors.map((inv: any) => {
        if (typeof inv === 'string') return inv;
        if (typeof inv === 'object' && inv.name) return inv.name;
        return String(inv);
      });
    }
    // Fallback to legacy inventors field
    else if (doc.inventors && Array.isArray(doc.inventors)) {
      inventors = doc.inventors as string[];
      console.log(`📄 Found legacy inventors: ${JSON.stringify(inventors)}`);
    }

    if (inventors.length > 0) {
      const inventorList =
        inventors.length === 1
          ? inventors[0]
          : inventors.length === 2
            ? `${inventors[0]} and ${inventors[1]}`
            : `${inventors.slice(0, -1).join(', ')}, and ${inventors[inventors.length - 1]}`;

      results.push(
        `**${doc.title}** (${getDocumentIdentifier(doc)}): ${inventorList}`
      );
      console.log(
        `✅ Generated inventor response for ${doc.title}: ${inventorList}`
      );
    } else {
      console.log(`⚠️ No inventors found for document: ${doc.title}`);
      console.log(
        `⚠️ Document metadata: actors=${JSON.stringify((doc as any).actors)}, inventors=${JSON.stringify(doc.inventors)}`
      );
    }
  }

  if (results.length === 0) {
    return "I don't have inventor information available for the documents in our current conversation.";
  }

  return results.join('\n\n');
}

/**
 * Generate structured response for author queries
 */
function generateAuthorResponse(documents: DocumentMetadata[]): string {
  const results: string[] = [];

  for (const doc of documents) {
    if (doc.authors_affiliations && Array.isArray(doc.authors_affiliations)) {
      const authors = doc.authors_affiliations as Array<{
        name: string;
        affiliation?: string;
      }>;
      if (authors.length > 0) {
        const authorList = authors
          .map(a => (a.affiliation ? `${a.name} (${a.affiliation})` : a.name))
          .join(', ');

        results.push(`**${doc.title}**: ${authorList}`);
      }
    }
  }

  if (results.length === 0) {
    return "I don't have author information available for the documents in our current conversation.";
  }

  return results.join('\n\n');
}

/**
 * Generate structured response for assignee queries
 */
function generateAssigneeResponse(documents: DocumentMetadata[]): string {
  const results: string[] = [];

  for (const doc of documents) {
    const assignees: string[] = [];

    if (doc.assignees && Array.isArray(doc.assignees)) {
      assignees.push(...(doc.assignees as string[]));
    }

    if (doc.original_assignee && !assignees.includes(doc.original_assignee)) {
      assignees.push(doc.original_assignee);
    }

    if (assignees.length > 0) {
      const assigneeList =
        assignees.length === 1 ? assignees[0] : assignees.join(', ');

      results.push(
        `**${doc.title}** (${getPatentNumber(doc) || 'Patent'}): ${assigneeList}`
      );
    }
  }

  if (results.length === 0) {
    return "I don't have assignee information available for the documents in our current conversation.";
  }

  return results.join('\n\n');
}

/**
 * Generate structured response for date queries
 */
function generateDateResponse(documents: DocumentMetadata[]): string {
  const results: string[] = [];

  for (const doc of documents) {
    const dates: string[] = [];

    const filedDate = getFiledDate(doc);
    const grantedDate = getGrantedDate(doc);
    const publishedDate = getPublishedDate(doc);

    if (filedDate)
      dates.push(`Filed: ${new Date(filedDate).toLocaleDateString()}`);
    if (publishedDate)
      dates.push(`Published: ${new Date(publishedDate).toLocaleDateString()}`);
    if (grantedDate)
      dates.push(`Granted: ${new Date(grantedDate).toLocaleDateString()}`);

    if (dates.length > 0) {
      results.push(
        `**${doc.title}** (${getDocumentIdentifier(doc)}):\n${dates.join(', ')}`
      );
    }
  }

  if (results.length === 0) {
    return "I don't have date information available for the documents in our current conversation.";
  }

  return results.join('\n\n');
}

/**
 * Generate structured response for venue queries
 */
function generateVenueResponse(documents: DocumentMetadata[]): string {
  const results: string[] = [];

  for (const doc of documents) {
    if (doc.venue) {
      const year = doc.publication_year ? ` (${doc.publication_year})` : '';
      results.push(`**${doc.title}**: ${doc.venue}${year}`);
    }
  }

  if (results.length === 0) {
    return "I don't have venue information available for the documents in our current conversation.";
  }

  return results.join('\n\n');
}

/**
 * Main metadata search function
 */
/**
 * Enhanced technology-aware document search
 */
async function searchByTechnologyTerms(
  technologyTerms: string[],
  supabaseClient?: any
): Promise<DocumentMetadata[]> {
  const client = supabaseClient || supabase;

  try {
    // Search by title patterns
    const titleSearches = technologyTerms
      .map(term => `title ILIKE '%${term}%'`)
      .join(' OR ');

    const { data: documents, error } = await client
      .from('documents')
      .select(
        `
        id, title, identifiers, dates, actors
      `
      )
      .or(titleSearches);

    if (error) {
      console.error(
        '❌ Error in technology term search:',
        error.message || error
      );
      return [];
    }

    console.log(
      `✅ Technology search found ${documents?.length || 0} documents for terms: ${technologyTerms.join(', ')}`
    );
    return documents || [];
  } catch (error) {
    console.error('Error in searchByTechnologyTerms:', error);
    return [];
  }
}

export async function executeMetadataSearch(
  query: string,
  conversationId?: string,
  supabaseClient?: any,
  documentIds?: string[]
): Promise<MetadataQueryResult> {
  const detection = detectMetadataQuery(query);

  if (!detection.isMetadata) {
    return { isMetadataQuery: false };
  }

  let documents: DocumentMetadata[] = [];

  console.log(`🏷️ Metadata query detected: ${detection.type}`);
  if (detection.technologyTerms) {
    console.log(`🔧 Technology terms: ${detection.technologyTerms.join(', ')}`);
  }

  // Handle technology queries first
  if (
    detection.type === 'technology_query' ||
    detection.type === 'technology_metadata' ||
    detection.type === 'display_technology' ||
    detection.type === 'optical_technology'
  ) {
    if (detection.technologyTerms && detection.technologyTerms.length > 0) {
      documents = await searchByTechnologyTerms(
        detection.technologyTerms,
        supabaseClient
      );
      console.log(`🔍 Technology search found ${documents.length} documents`);
    }
  }

  // Handle personal queries (David Fattal specific)
  if (detection.isPersonal) {
    if (detection.type === 'personal_patents') {
      documents = await searchDavidFattalDocuments('patents', supabaseClient);
    } else if (detection.type === 'personal_papers') {
      documents = await searchDavidFattalDocuments('papers', supabaseClient);
    } else if (detection.type === 'david_fattal_specific') {
      documents = await searchDavidFattalDocuments('all', supabaseClient);
    }

    if (documents.length === 0) {
      return {
        isMetadataQuery: true,
        queryType: detection.type,
        structuredResponse:
          "I couldn't find any documents by David Fattal in the current corpus. The corpus may need to be expanded or the documents may not have been processed yet.",
      };
    }
  } else {
    // Try to get documents from extracted context first (if available),
    // then fall back to conversation context
    if (documentIds && documentIds.length > 0) {
      console.log(
        `🎯 Using extracted document context: ${documentIds.length} document(s)`
      );
      console.log(`🎯 Document IDs: ${JSON.stringify(documentIds)}`);
      documents = await getDocumentsByIds(documentIds, supabaseClient);
      console.log(`🎯 Retrieved ${documents.length} documents from IDs`);
      if (documents.length > 0) {
        console.log(
          `🎯 First document: ${documents[0].title} (${getDocumentIdentifier(documents[0])})`
        );
        console.log(
          `🎯 First document inventors: ${JSON.stringify(documents[0].inventors)}`
        );
      }
    } else {
      // Try to extract specific identifiers from the query (patent numbers, DOIs, etc.)
      const patentMatches = query.match(
        /(?:patent\s+)?(?:US|EP|JP|CN|WO)?[\s-]?(\d{7,8}(?:[AB]\d?)?)/gi
      );
      const doiMatches = query.match(/(?:doi[:\s]+)?10\.\d{4,}\/[^\s]+/gi);

      if (patentMatches) {
        console.log(
          `🔍 Patent number(s) detected in query: ${patentMatches.join(', ')}`
        );
        for (const patentMatch of patentMatches) {
          const patentNo = patentMatch
            .replace(/^patent\s+/i, '')
            .trim()
            .toUpperCase();
          console.log(`🔍 Searching for patent: ${patentNo}`);
          const patentDocs = await searchByPatentNumber(
            patentNo,
            supabaseClient
          );
          documents.push(...patentDocs);
        }
      }

      if (doiMatches && documents.length === 0) {
        console.log(`🔍 DOI(s) detected in query: ${doiMatches.join(', ')}`);
        for (const doi of doiMatches) {
          console.log(`🔍 Searching for DOI: ${doi}`);
          const doiDocs = await searchByDOI(doi, supabaseClient);
          documents.push(...doiDocs);
        }
      }

      // If no specific identifiers found, fallback to conversation context
      if (documents.length === 0) {
        console.log(
          `🎯 No specific identifiers found, using conversation context (conversationId: ${conversationId})`
        );
        documents = await getContextualDocuments(
          conversationId,
          supabaseClient
        );
        console.log(
          `🎯 Retrieved ${documents.length} documents from conversation context`
        );
      } else {
        console.log(
          `🎯 Found ${documents.length} documents by identifier search`
        );
      }
    }

    console.log(`🎯 Final document count: ${documents.length}`);
    if (documents.length === 0) {
      console.log(`🎯 No documents found, returning canned response`);
      return {
        isMetadataQuery: true,
        queryType: detection.type,
        structuredResponse:
          'I need to have documents in our conversation context to answer questions about their metadata. Please ask me about specific documents first.',
      };
    }
  }

  // Generate appropriate response based on query type
  let structuredResponse: string;

  switch (detection.type) {
    case 'inventors':
      structuredResponse = generateInventorResponse(documents);
      break;
    case 'authors':
      structuredResponse = generateAuthorResponse(documents);
      break;
    case 'assignee':
      structuredResponse = generateAssigneeResponse(documents);
      break;
    case 'dates':
      structuredResponse = generateDateResponse(documents);
      break;
    case 'venue':
      structuredResponse = generateVenueResponse(documents);
      break;
    case 'citation':
      structuredResponse =
        documents
          .filter(d => d.citation_count && d.citation_count > 0)
          .map(d => `**${d.title}**: ${d.citation_count} citations`)
          .join('\n\n') || 'No citation information available.';
      break;
    case 'personal_patents':
      structuredResponse = generatePersonalPatentResponse(documents);
      break;
    case 'personal_papers':
      structuredResponse = generatePersonalPaperResponse(documents);
      break;
    case 'david_fattal_specific':
      structuredResponse = generateDavidFattalResponse(documents);
      break;
    default:
      structuredResponse =
        "I understand you're asking about document metadata, but I'm not sure what specific information you need. Could you be more specific?";
  }

  return {
    isMetadataQuery: true,
    queryType: detection.type,
    targetDocuments: documents,
    structuredResponse,
  };
}

/**
 * Search for David Fattal's documents (patents/papers) directly from database
 */
/**
 * Search for documents by patent number
 */
async function searchByPatentNumber(
  patentNo: string,
  supabaseClient?: any
): Promise<DocumentMetadata[]> {
  const client = supabaseClient || supabase;

  try {
    console.log(`🔍 Searching database for patent number: ${patentNo}`);

    // Search in both new identifiers JSONB field and legacy patent_no field
    const { data: documents, error } = await client
      .from('documents')
      .select(
        `
        id, title, identifiers, dates, actors
      `
      )
      .eq('identifiers->>patent_no', patentNo);

    if (error) {
      console.error(
        '❌ Error searching by patent number:',
        error.message || error
      );
      console.error('❌ Full error details:', JSON.stringify(error, null, 2));
      return [];
    }

    console.log(
      `✅ Found ${documents?.length || 0} documents for patent ${patentNo}`
    );
    if (documents && documents.length > 0) {
      console.log(`📄 First document: ${documents[0].title}`);
      console.log(
        `📄 Document metadata: identifiers=${JSON.stringify(documents[0].identifiers)}, actors=${JSON.stringify(documents[0].actors)}`
      );
    }

    return documents || [];
  } catch (error) {
    console.error('Error in searchByPatentNumber:', error);
    return [];
  }
}

/**
 * Search for documents by DOI
 */
async function searchByDOI(
  doi: string,
  supabaseClient?: any
): Promise<DocumentMetadata[]> {
  const client = supabaseClient || supabase;

  try {
    console.log(`🔍 Searching database for DOI: ${doi}`);

    // Search in both new identifiers JSONB field and legacy doi field
    const { data: documents, error } = await client
      .from('documents')
      .select(
        `
        id, title, identifiers, dates, actors
      `
      )
      .eq('identifiers->doi', doi);

    if (error) {
      console.error('❌ Error searching by DOI:', error.message || error);
      console.error('❌ Full error details:', JSON.stringify(error, null, 2));
      return [];
    }

    console.log(`✅ Found ${documents?.length || 0} documents for DOI ${doi}`);
    return documents || [];
  } catch (error) {
    console.error('Error in searchByDOI:', error);
    return [];
  }
}

export async function searchDavidFattalDocuments(
  queryType: 'patents' | 'papers' | 'all' = 'all',
  supabaseClient?: any
): Promise<DocumentMetadata[]> {
  try {
    console.log(
      `🔍 Searching for David Fattal documents (queryType: ${queryType})`
    );

    const client = supabaseClient || supabase;
    console.log(
      `📡 Using client: ${supabaseClient ? 'authenticated' : 'anonymous'}`
    );

    let query = client.from('documents').select(`
        id, title, doc_type, identifiers, dates,
        inventors, assignees, original_assignee,
        authors_affiliations, venue, publication_year,
        filed_date, granted_date, published_date,
        abstract, created_at
      `);

    // Filter by document type if specified
    if (queryType === 'patents') {
      query = query.eq('doc_type', 'patent');
    } else if (queryType === 'papers') {
      query = query.in('doc_type', ['paper', 'pdf']);
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) {
      console.error('Failed to search David Fattal documents:', error);
      return [];
    }

    if (!data || data.length === 0) {
      console.log(
        `⚠️ No documents found in database for queryType: ${queryType}`
      );
      return [];
    }

    console.log(
      `📊 Found ${data.length} total documents, filtering for David Fattal...`
    );

    // Filter for David Fattal's documents
    const davidDocuments = data.filter((doc: any) => {
      // Check patents by inventors
      if (doc.doc_type === 'patent' && doc.inventors) {
        try {
          // Handle both JSON string and direct array formats
          let inventors: string[];
          if (typeof doc.inventors === 'string') {
            inventors = JSON.parse(doc.inventors) as string[];
          } else if (Array.isArray(doc.inventors)) {
            inventors = doc.inventors as string[];
          } else {
            return false;
          }
          const hasDavidFattal = inventors.some(inventor => {
            const result = isDavidFattal(inventor);
            console.log(
              `👤 Checking inventor "${inventor}" -> isDavidFattal: ${result}`
            );
            return result;
          });

          if (hasDavidFattal) {
            console.log(
              `✅ Found David Fattal patent: ${doc.title} (${getPatentNumber(doc)})`
            );
          }

          return hasDavidFattal;
        } catch (error) {
          console.warn(
            'Error parsing inventors for document:',
            doc.title,
            error
          );
          return false;
        }
      }

      // Check papers by authors
      if (
        (doc.doc_type === 'paper' || doc.doc_type === 'pdf') &&
        doc.authors_affiliations
      ) {
        try {
          const authors = JSON.parse(doc.authors_affiliations) as Array<{
            name: string;
          }>;
          return authors.some(author => isDavidFattal(author.name));
        } catch {
          return false;
        }
      }

      return false;
    });

    console.log(
      `🎯 Final result: ${davidDocuments.length} David Fattal documents found`
    );
    if (davidDocuments.length > 0) {
      console.log(
        '📋 Found documents:',
        davidDocuments.map(
          (d: any) => `${d.title} (${getDocumentIdentifier(d)})`
        )
      );
    }

    return davidDocuments as DocumentMetadata[];
  } catch (error) {
    console.error('Error searching David Fattal documents:', error);
    return [];
  }
}

/**
 * Generate response for personal patent queries
 */
function generatePersonalPatentResponse(documents: DocumentMetadata[]): string {
  const patents = documents.filter(d => d.doc_type === 'patent');

  if (patents.length === 0) {
    return "I couldn't find any patents by David Fattal in the current corpus.";
  }

  const patentList = patents.map((patent, index) => {
    const inventors = patent.inventors
      ? typeof patent.inventors === 'string'
        ? JSON.parse(patent.inventors)
        : patent.inventors
      : [];
    const patentNo = getPatentNumber(patent) || 'Unknown';
    const assignee =
      patent.original_assignee ||
      (patent.assignees
        ? typeof patent.assignees === 'string'
          ? JSON.parse(patent.assignees)[0]
          : patent.assignees[0]
        : 'Unknown');

    return `**${patent.title}** (${patentNo}): ${inventors.join(', ')} - Assignee: ${assignee}`;
  });

  const intro =
    patents.length === 1
      ? "Here is David Fattal's important patent:"
      : `Here are David Fattal's ${patents.length} important patents:`;

  return `${intro}\n\n${patentList.join('\n\n')}`;
}

/**
 * Generate response for personal paper queries
 */
function generatePersonalPaperResponse(documents: DocumentMetadata[]): string {
  const papers = documents.filter(
    d => d.doc_type === 'paper' || d.doc_type === 'pdf'
  );

  if (papers.length === 0) {
    return "I couldn't find any papers by David Fattal in the current corpus.";
  }

  const paperList = papers.map((paper, index) => {
    const authors = paper.authors_affiliations
      ? typeof paper.authors_affiliations === 'string'
        ? JSON.parse(paper.authors_affiliations)
        : paper.authors_affiliations
      : [];
    const venue = paper.venue || 'Unknown venue';
    const year = paper.publication_year || 'Unknown year';

    const authorNames = authors.map((a: any) => a.name).join(', ');
    return `**${paper.title}**: ${authorNames} - Published in ${venue} (${year})`;
  });

  const intro =
    papers.length === 1
      ? "Here is David Fattal's important paper:"
      : `Here are David Fattal's ${papers.length} important papers:`;

  return `${intro}\n\n${paperList.join('\n\n')}`;
}

/**
 * Generate response for general David Fattal queries
 */
function generateDavidFattalResponse(documents: DocumentMetadata[]): string {
  const patents = documents.filter(d => d.doc_type === 'patent');
  const papers = documents.filter(
    d => d.doc_type === 'paper' || d.doc_type === 'pdf'
  );

  if (documents.length === 0) {
    return "I couldn't find any documents by David Fattal in the current corpus.";
  }

  let response = `I found ${documents.length} document(s) by David Fattal:\n\n`;

  if (patents.length > 0) {
    response += `**Patents (${patents.length}):**\n`;
    patents.forEach(patent => {
      response += `• ${patent.title} (${getPatentNumber(patent) || 'Unknown'})\n`;
    });
    response += '\n';
  }

  if (papers.length > 0) {
    response += `**Papers (${papers.length}):**\n`;
    papers.forEach(paper => {
      response += `• ${paper.title}\n`;
    });
  }

  return response.trim();
}
