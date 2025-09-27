/**
 * Persona Validation Middleware
 *
 * Provides reusable middleware functions for validating personas
 * across API routes and ensuring consistent error handling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { personaManager } from './persona-manager';
import type { PersonaConfig, DocumentProcessingConfig } from './types';

export interface PersonaValidationResult {
  success: boolean;
  persona_id: string;
  config?: PersonaConfig | DocumentProcessingConfig;
  errors?: string[];
  warnings?: string[];
}

export interface PersonaMiddlewareContext {
  persona_id: string;
  config: PersonaConfig;
  processing_config: DocumentProcessingConfig;
}

/**
 * Validate that a persona exists and is active
 */
export async function validatePersona(persona_id: string): Promise<PersonaValidationResult> {
  try {
    const result = await personaManager.getPersonaConfig(persona_id);

    if (!result.success || !result.config) {
      return {
        success: false,
        persona_id,
        errors: result.errors || [`Persona '${persona_id}' not found or invalid`]
      };
    }

    if (!result.config.is_active) {
      return {
        success: false,
        persona_id,
        errors: [`Persona '${persona_id}' is not active`]
      };
    }

    return {
      success: true,
      persona_id,
      config: result.config,
      warnings: result.warnings
    };
  } catch (error) {
    return {
      success: false,
      persona_id,
      errors: [`Failed to validate persona: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Validate that a persona exists and get its document processing config
 */
export async function validatePersonaForProcessing(persona_id: string): Promise<PersonaValidationResult> {
  try {
    const result = await personaManager.getDocumentProcessingConfig(persona_id);

    if (!result.success || !result.config) {
      return {
        success: false,
        persona_id,
        errors: result.errors || [`Persona '${persona_id}' processing config not available`]
      };
    }

    return {
      success: true,
      persona_id,
      config: result.config
    };
  } catch (error) {
    return {
      success: false,
      persona_id,
      errors: [`Failed to load persona processing config: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Validate that a document type is allowed for a persona
 */
export async function validateDocumentType(
  persona_id: string,
  doc_type: string
): Promise<PersonaValidationResult> {
  try {
    const isAllowed = await personaManager.validateDocumentType(persona_id, doc_type);

    if (!isAllowed) {
      // Get allowed types for better error message
      const configResult = await personaManager.getDocumentProcessingConfig(persona_id);
      const allowedTypes = configResult.success && configResult.config
        ? configResult.config.document_types
        : [];

      return {
        success: false,
        persona_id,
        errors: [
          `Document type '${doc_type}' is not allowed for persona '${persona_id}'.`,
          `Allowed types: ${allowedTypes.join(', ')}`
        ]
      };
    }

    return {
      success: true,
      persona_id
    };
  } catch (error) {
    return {
      success: false,
      persona_id,
      errors: [`Failed to validate document type: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Middleware function for Next.js API routes to validate persona context
 */
export async function withPersonaValidation(
  persona_id: string,
  options: {
    requireProcessingConfig?: boolean;
    requireDocumentType?: string;
  } = {}
): Promise<{
  success: boolean;
  context?: PersonaMiddlewareContext;
  response?: NextResponse
}> {
  const { requireProcessingConfig = false, requireDocumentType } = options;

  // Step 1: Validate persona exists and is active
  const personaValidation = await validatePersona(persona_id);
  if (!personaValidation.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Persona validation failed',
          persona_id,
          details: personaValidation.errors
        },
        { status: 404 }
      )
    };
  }

  // Step 2: Get processing config if required
  let processingConfig: DocumentProcessingConfig | undefined;
  if (requireProcessingConfig) {
    const processingValidation = await validatePersonaForProcessing(persona_id);
    if (!processingValidation.success) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'Persona processing configuration not available',
            persona_id,
            details: processingValidation.errors
          },
          { status: 400 }
        )
      };
    }
    processingConfig = processingValidation.config as DocumentProcessingConfig;
  }

  // Step 3: Validate document type if required
  if (requireDocumentType) {
    const docTypeValidation = await validateDocumentType(persona_id, requireDocumentType);
    if (!docTypeValidation.success) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'Document type not allowed',
            persona_id,
            document_type: requireDocumentType,
            details: docTypeValidation.errors
          },
          { status: 400 }
        )
      };
    }
  }

  // Success - return context
  const context: PersonaMiddlewareContext = {
    persona_id,
    config: personaValidation.config as PersonaConfig,
    processing_config: processingConfig || await personaManager.getDocumentProcessingConfig(persona_id).then(r => r.config!)
  };

  return {
    success: true,
    context
  };
}

/**
 * Higher-order function to wrap API route handlers with persona validation
 */
export function withPersonaMiddleware<T extends any[]>(
  handler: (
    request: NextRequest,
    context: { params: Promise<{ personaId: string }> },
    personaContext: PersonaMiddlewareContext,
    ...args: T
  ) => Promise<NextResponse>,
  options: {
    requireProcessingConfig?: boolean;
    requireDocumentTypeFromRequest?: boolean;
  } = {}
) {
  return async (
    request: NextRequest,
    context: { params: Promise<{ personaId: string }> },
    ...args: T
  ): Promise<NextResponse> => {
    try {
      const { personaId } = await context.params;

      // Get document type from request if required
      let requireDocumentType: string | undefined;
      if (options.requireDocumentTypeFromRequest) {
        if (request.method === 'POST') {
          const formData = await request.formData();
          requireDocumentType = formData.get('doc_type') as string;

          if (!requireDocumentType) {
            return NextResponse.json(
              { error: 'Document type (doc_type) is required' },
              { status: 400 }
            );
          }
        }
      }

      // Validate persona
      const validation = await withPersonaValidation(personaId, {
        requireProcessingConfig: options.requireProcessingConfig,
        requireDocumentType
      });

      if (!validation.success) {
        return validation.response!;
      }

      // Call the original handler with persona context
      return handler(request, context, validation.context!, ...args);

    } catch (error) {
      console.error('Persona middleware error:', error);
      return NextResponse.json(
        {
          error: 'Internal server error in persona middleware',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Utility function to create standardized error responses
 */
export function createPersonaErrorResponse(
  error: string,
  persona_id: string,
  details?: string[],
  status: number = 400
): NextResponse {
  return NextResponse.json(
    {
      error,
      persona_id,
      details: details || [],
      timestamp: new Date().toISOString()
    },
    { status }
  );
}

/**
 * Utility function to log persona operations for audit trail
 */
export function logPersonaOperation(
  operation: string,
  persona_id: string,
  result: { success: boolean; error?: string; details?: any }
): void {
  console.log(`🎭 Persona ${operation}: ${persona_id} - ${result.success ? 'SUCCESS' : 'FAILED'}`, {
    operation,
    persona_id,
    success: result.success,
    error: result.error,
    details: result.details,
    timestamp: new Date().toISOString()
  });
}