/**
 * Patent Evolution Relationship Extractor
 * 
 * Extracts technology evolution relationships from patents,
 * specifically targeting Leia's display technology progression.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { EntityKind } from './types';

// =======================
// Patent Evolution Definitions
// =======================

export interface PatentEvolution {
  fromPatent: string;
  toPatent: string;
  fromTechnology: string;
  toTechnology: string;
  evolutionType: 'enhancement' | 'replacement' | 'component_change' | 'approach_shift';
  timelineContext: string;
  confidence: number;
}

export interface TechnologyTimeline {
  technology: string;
  patents: Array<{
    patentNo: string;
    date: Date;
    role: 'introduced' | 'enhanced' | 'superseded';
  }>;
}

// Key Leia technology evolution patterns
export const LEIA_TECHNOLOGY_EVOLUTION: PatentEvolution[] = [
  {
    fromPatent: "US10830939B2",
    toPatent: "US10838134B2", 
    fromTechnology: "Diffractive Lightfield Backlight Technology",
    toTechnology: "Diffractive Lightfield Backlight Technology",
    evolutionType: "enhancement",
    timelineContext: "Improved DLB implementation (2013-2020)",
    confidence: 0.9
  },
  {
    fromPatent: "US10838134B2",
    toPatent: "WO2024145265A1",
    fromTechnology: "Diffractive Lightfield Backlight Technology", 
    toTechnology: "Eye-Tracked Stereoscopic Display Technology",
    evolutionType: "enhancement",
    timelineContext: "Added eye-tracking and pixel mapping to DLB (2020-2023)",
    confidence: 0.95
  },
  {
    fromPatent: "WO2024145265A1",
    toPatent: "US11281020B2",
    fromTechnology: "Eye-Tracked Stereoscopic Display Technology",
    toTechnology: "Eye-Tracked Stereoscopic Display Technology", 
    evolutionType: "component_change",
    timelineContext: "Transitioned from DLB to switchable LC component (2024+)",
    confidence: 0.9
  }
];

// =======================
// Evolution Detection Functions
// =======================

/**
 * Extract evolution relationships from patent content analysis
 */
export async function extractPatentEvolutionRelationships(
  patentNo: string,
  content: string,
  metadata: any
): Promise<Array<{
  srcName: string;
  srcType: EntityKind;
  relation: string;
  dstName: string;
  dstType: EntityKind;
  confidence: number;
  evidenceText: string;
  timeline?: string;
}>> {
  const relationships: Array<any> = [];
  
  // 1. Check for explicit evolution mentions
  const evolutionPatterns = [
    // Direct evolution statements
    /(?:evolved|developed|progressed)\s+from\s+([^.]{10,80})\s+to\s+([^.]{10,80})/gi,
    /([^.]{10,80})\s+(?:was|were)\s+(?:replaced|superseded)\s+by\s+([^.]{10,80})/gi,
    /(?:previous|earlier)\s+([^.]{10,80})\s+(?:approaches?|implementations?)\s+(?:used|employed)\s+([^.]{10,80})/gi,
    
    // Timeline indicators
    /(?:initially|originally|first)\s+(?:used|employed)\s+([^.]{10,80})\s+(?:but|however|then)\s+(?:later|subsequently)\s+(?:adopted|used)\s+([^.]{10,80})/gi,
    /(?:transition|shift|move)\s+from\s+([^.]{10,80})\s+to\s+([^.]{10,80})/gi,
  ];
  
  for (const pattern of evolutionPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const fromTech = match[1]?.trim();
      const toTech = match[2]?.trim();
      
      if (fromTech && toTech && fromTech !== toTech) {
        relationships.push({
          srcName: fromTech,
          srcType: 'technology' as EntityKind,
          relation: 'evolved_to',
          dstName: toTech,
          dstType: 'technology' as EntityKind,
          confidence: 0.8,
          evidenceText: match[0].substring(0, 200),
          timeline: extractTimelineContext(match[0])
        });
      }
    }
  }
  
  // 2. Check for component transition patterns
  const componentEvolutionPatterns = [
    /(?:instead of|rather than)\s+([^.]{10,60}),\s+(?:the|this)\s+(?:system|display|technology)\s+(?:uses|employs)\s+([^.]{10,60})/gi,
    /([^.]{10,60})\s+(?:can be|may be|is)\s+(?:replaced|substituted)\s+(?:with|by)\s+([^.]{10,60})/gi,
  ];
  
  for (const pattern of componentEvolutionPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const fromComponent = match[1]?.trim();
      const toComponent = match[2]?.trim();
      
      if (fromComponent && toComponent && fromComponent !== toComponent) {
        relationships.push({
          srcName: fromComponent,
          srcType: 'component' as EntityKind,
          relation: 'alternative_to',
          dstName: toComponent,
          dstType: 'component' as EntityKind,
          confidence: 0.75,
          evidenceText: match[0].substring(0, 200)
        });
      }
    }
  }
  
  // 3. Apply known Leia evolution patterns
  const leiaEvolutions = LEIA_TECHNOLOGY_EVOLUTION.filter(
    evo => evo.fromPatent === patentNo || evo.toPatent === patentNo
  );
  
  for (const evolution of leiaEvolutions) {
    relationships.push({
      srcName: evolution.fromTechnology,
      srcType: 'technology' as EntityKind,
      relation: 'evolved_to',
      dstName: evolution.toTechnology,
      dstType: 'technology' as EntityKind,
      confidence: evolution.confidence,
      evidenceText: `Known Leia technology evolution: ${evolution.timelineContext}`,
      timeline: evolution.timelineContext
    });
  }
  
  return relationships;
}

/**
 * Extract timeline context from evolution text
 */
function extractTimelineContext(text: string): string | undefined {
  const timelinePatterns = [
    /(?:since|from|starting)\s+(\d{4})/i,
    /(?:in|during)\s+(\d{4}[-–]\d{4})/i,
    /(?:early|late)\s+(\d{4}s?)/i,
    /(initially|originally|first|later|subsequently|then|finally)/i
  ];
  
  for (const pattern of timelinePatterns) {
    const match = pattern.exec(text);
    if (match) {
      return match[1] || match[0];
    }
  }
  
  return undefined;
}

/**
 * Create technology timeline from patents in database
 */
export async function createTechnologyTimeline(
  technologyName: string
): Promise<TechnologyTimeline | null> {
  try {
    // Find patents that mention this technology
    const { data: documents } = await supabaseAdmin
      .from('documents')
      .select('patent_no, title, filed_date, granted_date')
      .eq('doc_type', 'patent')
      .not('patent_no', 'is', null);
    
    if (!documents) return null;
    
    // Filter patents that likely contain this technology
    const relevantPatents = documents.filter(doc => 
      doc.title.toLowerCase().includes(technologyName.toLowerCase()) ||
      (doc.patent_no && LEIA_TECHNOLOGY_EVOLUTION.some(evo => 
        evo.fromPatent === doc.patent_no || evo.toPatent === doc.patent_no
      ))
    );
    
    if (relevantPatents.length === 0) return null;
    
    // Sort by date and assign roles
    const timeline = relevantPatents
      .map(patent => {
        const date = patent.granted_date || patent.filed_date;
        const evolution = LEIA_TECHNOLOGY_EVOLUTION.find(evo => 
          evo.fromPatent === patent.patent_no || evo.toPatent === patent.patent_no
        );
        
        let role: 'introduced' | 'enhanced' | 'superseded' = 'enhanced';
        if (evolution) {
          if (evolution.fromPatent === patent.patent_no) {
            role = evolution.evolutionType === 'replacement' ? 'superseded' : 'enhanced';
          } else if (evolution.toPatent === patent.patent_no) {
            role = 'introduced';
          }
        }
        
        return {
          patentNo: patent.patent_no,
          date: new Date(date),
          role
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    
    return {
      technology: technologyName,
      patents: timeline
    };
    
  } catch (error) {
    console.error('Error creating technology timeline:', error);
    return null;
  }
}

/**
 * Get all technology evolution relationships for a patent
 */
export async function getPatentEvolutionContext(
  patentNo: string
): Promise<{
  predecessors: PatentEvolution[];
  successors: PatentEvolution[];
  relatedTechnologies: string[];
}> {
  const predecessors = LEIA_TECHNOLOGY_EVOLUTION.filter(evo => evo.toPatent === patentNo);
  const successors = LEIA_TECHNOLOGY_EVOLUTION.filter(evo => evo.fromPatent === patentNo);
  
  const relatedTechnologies = new Set<string>();
  [...predecessors, ...successors].forEach(evo => {
    relatedTechnologies.add(evo.fromTechnology);
    relatedTechnologies.add(evo.toTechnology);
  });
  
  return {
    predecessors,
    successors,
    relatedTechnologies: Array.from(relatedTechnologies)
  };
}

/**
 * Enhance patent metadata with evolution context
 */
export async function enhancePatentWithEvolutionContext(
  patentNo: string,
  existingMetadata: any
): Promise<any> {
  const evolutionContext = await getPatentEvolutionContext(patentNo);
  
  return {
    ...existingMetadata,
    evolutionContext: {
      predecessorPatents: evolutionContext.predecessors.map(p => p.fromPatent),
      successorPatents: evolutionContext.successors.map(p => p.toPatent),
      relatedTechnologies: evolutionContext.relatedTechnologies,
      timelinePosition: evolutionContext.predecessors.length > 0 ? 'evolution' : 
                      evolutionContext.successors.length > 0 ? 'foundation' : 'standalone'
    }
  };
}