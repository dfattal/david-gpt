import { NextRequest, NextResponse } from 'next/server';
import { PersonaManager } from '@/lib/personas/persona-manager';
import { PersonaValidator } from '@/lib/personas/persona-validator';
import { PersonaUpdateRequestSchema } from '@/lib/personas/types';

interface Params {
  personaId: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { personaId } = await context.params;
    const persona = await PersonaManager.getPersona(personaId);

    if (!persona) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ persona });
  } catch (error) {
    console.error(`Failed to get persona ${(await context.params).personaId}:`, error);
    return NextResponse.json(
      { error: 'Failed to get persona' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { personaId } = await context.params;
    const body = await request.json();

    // Validate request body
    const validation = PersonaUpdateRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request format', details: validation.error.issues },
        { status: 400 }
      );
    }

    const updates = validation.data;

    // If content is being updated, validate it
    if (updates.persona_md || updates.constraints_yaml) {
      // Get current persona to fill in missing parts
      const currentPersona = await PersonaManager.getPersona(personaId);
      if (!currentPersona) {
        return NextResponse.json(
          { error: 'Persona not found' },
          { status: 404 }
        );
      }

      const contentToValidate = {
        personaMd: updates.persona_md || currentPersona.persona_md,
        constraintsYaml: updates.constraints_yaml || currentPersona.constraints_yaml
      };

      const contentValidation = PersonaValidator.validateFromContent(contentToValidate);

      if (!contentValidation.isValid) {
        return NextResponse.json(
          {
            error: 'Persona validation failed',
            validation_errors: contentValidation.errors,
            validation_warnings: contentValidation.warnings
          },
          { status: 400 }
        );
      }
    }

    // Update persona
    const updatedPersona = await PersonaManager.updatePersona(personaId, updates);

    if (!updatedPersona) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ persona: updatedPersona });

  } catch (error) {
    console.error(`Failed to update persona ${(await context.params).personaId}:`, error);
    return NextResponse.json(
      { error: 'Failed to update persona' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { personaId } = await context.params;
    const success = await PersonaManager.deletePersona(personaId);

    if (!success) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Persona deleted successfully' });

  } catch (error) {
    console.error(`Failed to delete persona ${(await context.params).personaId}:`, error);
    return NextResponse.json(
      { error: 'Failed to delete persona' },
      { status: 500 }
    );
  }
}