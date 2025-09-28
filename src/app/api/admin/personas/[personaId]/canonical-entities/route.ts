import { NextRequest, NextResponse } from 'next/server';
import { ConstraintsParser } from '@/lib/personas/constraints-parser';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';

interface CanonicalEntityDefinition {
  description: string;
  aliases: string[];
  priority: number;
  domain?: string;
}

interface CanonicalRelationshipDefinition {
  from: string;
  relation: string;
  to: string;
  confidence: number;
  context?: string;
}

interface CanonicalEntitiesConfig {
  [entityKind: string]: {
    [canonicalName: string]: CanonicalEntityDefinition;
  };
}

interface PersonaCanonicalData {
  persona_id: string;
  canonical_entities: CanonicalEntitiesConfig;
  canonical_relationships: CanonicalRelationshipDefinition[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ personaId: string }> }
) {
  try {
    const { personaId } = await params;
    const constraintsPath = join(
      process.cwd(),
      'personas',
      personaId,
      'constraints.yaml'
    );

    try {
      const result = await ConstraintsParser.parseFromFile(constraintsPath);

      if (!result.success || !result.constraints) {
        return NextResponse.json(
          { error: 'Failed to parse persona constraints' },
          { status: 400 }
        );
      }

      const canonicalData: PersonaCanonicalData = {
        persona_id: personaId,
        canonical_entities: result.constraints.canonical_entities || {},
        canonical_relationships:
          result.constraints.canonical_relationships || [],
      };

      return NextResponse.json(canonicalData);
    } catch (error) {
      // If file doesn't exist, return empty data
      const emptyData: PersonaCanonicalData = {
        persona_id: personaId,
        canonical_entities: {},
        canonical_relationships: [],
      };

      return NextResponse.json(emptyData);
    }
  } catch (error) {
    console.error('Error fetching canonical entities:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ personaId: string }> }
) {
  try {
    const { personaId } = await params;
    const canonicalData: PersonaCanonicalData = await request.json();

    // Validate the data structure
    if (
      !canonicalData.canonical_entities ||
      !canonicalData.canonical_relationships
    ) {
      return NextResponse.json(
        { error: 'Invalid canonical data structure' },
        { status: 400 }
      );
    }

    const constraintsPath = join(
      process.cwd(),
      'personas',
      personaId,
      'constraints.yaml'
    );

    // Read existing constraints file
    let existingConstraints: any = {};
    try {
      const content = readFileSync(constraintsPath, 'utf-8');
      existingConstraints = yaml.load(content) as any;
    } catch (error) {
      // If file doesn't exist, we'll create it with just the canonical data
      console.log('Constraints file not found, creating new one');
    }

    // Update canonical entities and relationships
    existingConstraints.canonical_entities = canonicalData.canonical_entities;
    existingConstraints.canonical_relationships =
      canonicalData.canonical_relationships;

    // Write back to file
    const updatedYaml = yaml.dump(existingConstraints, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });

    writeFileSync(constraintsPath, updatedYaml, 'utf-8');

    // Validate the updated constraints
    const validationResult =
      await ConstraintsParser.parseFromFile(constraintsPath);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Updated constraints failed validation',
          validation_errors: validationResult.errors,
          validation_warnings: validationResult.warnings,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Canonical entities updated successfully',
      validation_warnings: validationResult.warnings,
    });
  } catch (error) {
    console.error('Error updating canonical entities:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ personaId: string }> }
) {
  try {
    const { personaId } = await params;
    const { action, data } = await request.json();

    switch (action) {
      case 'validate':
        // Validate canonical entities structure
        try {
          const result = await ConstraintsParser.parseFromContent(
            yaml.dump(data)
          );
          return NextResponse.json({
            valid: result.success,
            errors: result.errors,
            warnings: result.warnings,
          });
        } catch (error) {
          return NextResponse.json({
            valid: false,
            errors: ['Failed to parse YAML data'],
            warnings: [],
          });
        }

      case 'export':
        // Export canonical entities
        const constraintsPath = join(
          process.cwd(),
          'personas',
          personaId,
          'constraints.yaml'
        );
        try {
          const result = await ConstraintsParser.parseFromFile(constraintsPath);
          if (result.success && result.constraints) {
            return NextResponse.json({
              canonical_entities: result.constraints.canonical_entities || {},
              canonical_relationships:
                result.constraints.canonical_relationships || [],
            });
          }
        } catch (error) {
          return NextResponse.json(
            { error: 'Failed to export canonical entities' },
            { status: 400 }
          );
        }
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in canonical entities POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
