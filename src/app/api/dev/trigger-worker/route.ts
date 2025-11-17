/**
 * Development Webhook - Trigger Local Worker
 * POST /api/dev/trigger-worker
 *
 * Spawns the on-demand worker process locally
 * Only available in development mode
 */

import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST() {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  try {
    console.log('🔔 [DEV] Triggering local worker...');

    // Spawn worker process in background
    const worker = spawn('pnpm', ['worker:on-demand'], {
      detached: true,
      stdio: 'inherit',
      env: process.env,
    });

    // Don't wait for worker to complete
    worker.unref();

    console.log(`✅ [DEV] Worker process started (PID: ${worker.pid})`);

    return NextResponse.json({
      success: true,
      message: 'Worker started',
      pid: worker.pid,
    });
  } catch (error) {
    console.error('❌ [DEV] Failed to start worker:', error);
    return NextResponse.json(
      { error: 'Failed to start worker' },
      { status: 500 }
    );
  }
}
