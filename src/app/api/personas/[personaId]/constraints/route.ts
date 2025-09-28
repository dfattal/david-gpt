import { NextRequest, NextResponse } from 'next/server';
import { ConstraintsParser } from '@/lib/personas/constraints-parser';
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

    const parseResult =
      await ConstraintsParser.parseFromPersonaFolder(personaPath);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Failed to parse constraints',
          parse_errors: parseResult.errors,
          warnings: parseResult.warnings,
        },
        { status: 400 }
      );
    }

    const summary = parseResult.constraints
      ? ConstraintsParser.generateConstraintsSummary(parseResult.constraints)
      : '';

    return NextResponse.json({
      persona_id: personaId,
      constraints: parseResult.constraints,
      summary,
      warnings: parseResult.warnings,
    });
  } catch (error) {
    console.error(
      `Failed to get constraints for persona ${(await context.params).personaId}:`,
      error
    );
    return NextResponse.json(
      { error: 'Failed to get persona constraints' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.constraints_yaml) {
      return NextResponse.json(
        { error: 'constraints_yaml content is required' },
        { status: 400 }
      );
    }

    const parseResult = ConstraintsParser.parseFromContent(
      body.constraints_yaml
    );

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Failed to parse constraints',
          parse_errors: parseResult.errors,
          warnings: parseResult.warnings,
        },
        { status: 400 }
      );
    }

    const summary = parseResult.constraints
      ? ConstraintsParser.generateConstraintsSummary(parseResult.constraints)
      : '';

    return NextResponse.json({
      constraints: parseResult.constraints,
      summary,
      warnings: parseResult.warnings,
    });
  } catch (error) {
    console.error('Failed to parse constraints content:', error);
    return NextResponse.json(
      { error: 'Failed to parse constraints content' },
      { status: 500 }
    );
  }
}
