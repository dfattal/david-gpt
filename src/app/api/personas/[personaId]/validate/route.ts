import { NextRequest, NextResponse } from 'next/server';
import { PersonaValidator } from '@/lib/personas/persona-validator';
import { join } from 'path';

interface Params {
  personaId: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { personaId } = await context.params;
    const personaPath = join(process.cwd(), 'personas', personaId);

    const validationResult = await PersonaValidator.validateFromDisk(personaPath);

    return NextResponse.json({
      persona_id: personaId,
      validation: validationResult,
      report: PersonaValidator.formatValidationReport(validationResult)
    });

  } catch (error) {
    console.error(`Failed to validate persona ${(await context.params).personaId}:`, error);
    return NextResponse.json(
      { error: 'Failed to validate persona' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.persona_md || !body.constraints_yaml) {
      return NextResponse.json(
        { error: 'Both persona_md and constraints_yaml content are required' },
        { status: 400 }
      );
    }

    const validationResult = PersonaValidator.validateFromContent({
      personaMd: body.persona_md,
      constraintsYaml: body.constraints_yaml
    });

    return NextResponse.json({
      validation: validationResult,
      report: PersonaValidator.formatValidationReport(validationResult)
    });

  } catch (error) {
    console.error('Failed to validate persona content:', error);
    return NextResponse.json(
      { error: 'Failed to validate persona content' },
      { status: 500 }
    );
  }
}