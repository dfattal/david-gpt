/**
 * API Route Middleware
 * 
 * Provides reusable middleware for authentication, validation, error handling,
 * and other common API route concerns to eliminate duplication across routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createOptimizedAdminClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';
import type { SupabaseClient, User } from '@supabase/supabase-js';

// =======================
// Types
// =======================

export interface AuthenticatedContext {
  supabase: SupabaseClient;
  user: User;
  isServiceRole?: boolean;
}

export interface RequestBody {
  [key: string]: any;
}

export interface ParsedFormData {
  body: RequestBody;
  files: Map<string, { buffer: Buffer; fileName: string; size: number }>;
}

export type APIHandler<T = any> = (
  req: NextRequest,
  context: AuthenticatedContext,
  data?: T
) => Promise<NextResponse>;

export interface MiddlewareOptions {
  requireAuth?: boolean;
  allowServiceRole?: boolean;
  requireRole?: 'admin' | 'member';
  maxFileSize?: number; // bytes
  allowedFileTypes?: string[];
  validateBody?: (body: any) => void | Promise<void>;
}

// =======================
// Authentication Middleware
// =======================

export async function withAuth(
  req: NextRequest,
  options: MiddlewareOptions = {}
): Promise<AuthenticatedContext> {
  const { requireAuth = true, allowServiceRole = false, requireRole } = options;

  if (!requireAuth) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return { supabase, user: user as User };
  }

  // Check for service role bypass (for testing/automation)
  if (allowServiceRole) {
    const authHeader = req.headers.get('Authorization');
    const isServiceRoleRequest = authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    if (isServiceRoleRequest) {
      const supabase = createOptimizedAdminClient();
      // Use test admin user for service role requests
      const user = { 
        id: 'b349bd11-bd69-4582-9713-3ada0ba58fcf', 
        email: 'dfattal@gmail.com',
        // Add other required User properties with safe defaults
        aud: 'authenticated',
        role: 'authenticated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        app_metadata: { role: 'admin' },
        user_metadata: {}
      } as User;
      
      console.log('🔑 Using service role authentication');
      return { supabase, user, isServiceRole: true };
    }
  }

  // Standard authentication
  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new AppError('Authentication required', 401);
  }

  // Check role requirements
  if (requireRole) {
    const userRole = user.app_metadata?.role || 'member';
    if (requireRole === 'admin' && userRole !== 'admin') {
      throw new AppError('Admin access required', 403);
    }
  }

  return { supabase, user };
}

// =======================
// Request Parsing Middleware
// =======================

export async function parseRequest(req: NextRequest, options: MiddlewareOptions = {}): Promise<RequestBody | ParsedFormData> {
  const { maxFileSize = 50 * 1024 * 1024, allowedFileTypes } = options; // 50MB default
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    return await parseFormData(req, { maxFileSize, allowedFileTypes });
  } else if (contentType.includes('application/json')) {
    return await parseJSON(req);
  } else {
    throw new AppError('Unsupported content type', 400);
  }
}

async function parseJSON(req: NextRequest): Promise<RequestBody> {
  try {
    return await req.json();
  } catch (error) {
    throw new AppError('Invalid JSON in request body', 400);
  }
}

async function parseFormData(
  req: NextRequest, 
  options: { maxFileSize: number; allowedFileTypes?: string[] }
): Promise<ParsedFormData> {
  const formData = await req.formData();
  const files = new Map<string, { buffer: Buffer; fileName: string; size: number }>();
  let body: RequestBody = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      // Validate file size
      if (value.size > options.maxFileSize) {
        throw new AppError(`File ${value.name} exceeds maximum size of ${options.maxFileSize} bytes`, 400);
      }

      // Validate file type
      if (options.allowedFileTypes && !options.allowedFileTypes.includes(value.type)) {
        throw new AppError(`File type ${value.type} not allowed`, 400);
      }

      const buffer = Buffer.from(await value.arrayBuffer());
      files.set(key, {
        buffer,
        fileName: value.name,
        size: value.size
      });
    } else {
      // Handle form fields
      if (key === 'body' || key === 'data') {
        try {
          body = { ...body, ...JSON.parse(value as string) };
        } catch {
          body[key] = value;
        }
      } else {
        body[key] = value;
      }
    }
  }

  return { body, files };
}

// =======================
// Validation Middleware
// =======================

export function validateBody(body: any, validator: (body: any) => void | Promise<void>) {
  return validator(body);
}

// =======================
// Error Handling Middleware
// =======================

export function withErrorHandling<T>(handler: APIHandler<T>) {
  return async (req: NextRequest, context: AuthenticatedContext, data?: T): Promise<NextResponse> => {
    try {
      return await handler(req, context, data);
    } catch (error) {
      console.error('API Error:', error);
      return handleApiError(error);
    }
  };
}

// =======================
// Composed Middleware
// =======================

export function createAPIHandler<T = any>(
  handler: APIHandler<T>,
  options: MiddlewareOptions = {}
): (req: NextRequest) => Promise<NextResponse> {
  return withErrorHandling(async (req: NextRequest): Promise<NextResponse> => {
    // Authentication
    const context = await withAuth(req, options);

    // Request parsing
    const data = await parseRequest(req, options) as T;

    // Body validation
    if (options.validateBody && 'body' in (data as any)) {
      await validateBody((data as any).body, options.validateBody);
    } else if (options.validateBody && !('body' in (data as any))) {
      await validateBody(data, options.validateBody);
    }

    // Execute handler
    return await handler(req, context, data);
  });
}

// =======================
// Utility Functions
// =======================

export function requireFields(obj: any, fields: string[], context = 'Request'): void {
  const missing = fields.filter(field => !obj[field]);
  if (missing.length > 0) {
    throw new AppError(`${context} missing required fields: ${missing.join(', ')}`, 400);
  }
}

export function sanitizeString(str: string, maxLength = 1000): string {
  return str.trim().slice(0, maxLength);
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}