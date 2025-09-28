import { NextRequest, NextResponse } from 'next/server';
import { PersonaManager } from '@/lib/personas/persona-manager';
import { PersonaValidator } from '@/lib/personas/persona-validator';
import { PersonaCreateRequestSchema } from '@/lib/personas/types';

export async function GET() {
  try {
    const personas = await PersonaManager.listPersonas();
    return NextResponse.json({ personas });
  } catch (error) {
    console.error('Failed to list personas:', error);
    return NextResponse.json(
      { error: 'Failed to list personas' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validation = PersonaCreateRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request format', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { metadata, constraints_yaml, persona_md } = validation.data;

    // Validate persona content
    const contentValidation = PersonaValidator.validateFromContent({
      personaMd: persona_md,
      constraintsYaml: constraints_yaml,
    });

    if (!contentValidation.isValid) {
      return NextResponse.json(
        {
          error: 'Persona validation failed',
          validation_errors: contentValidation.errors,
          validation_warnings: contentValidation.warnings,
        },
        { status: 400 }
      );
    }

    // Create persona
    const persona = await PersonaManager.createPersona({
      metadata,
      constraints_yaml,
      persona_md,
    });

    return NextResponse.json(
      {
        persona,
        validation_report: {
          warnings: contentValidation.warnings,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create persona:', error);
    return NextResponse.json(
      { error: 'Failed to create persona' },
      { status: 500 }
    );
  }
}
