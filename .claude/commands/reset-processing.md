# Reset Document Processing

Terminates all running document processing jobs and cleans up background shells to prepare for a fresh ingestion run.

## Usage

```
/reset-processing
```

## What it does

1. **Kills All Processing Jobs**: Terminates any running `process-documents.ts` scripts
2. **Cleans Background Shells**: Kills all background bash shells related to document processing
3. **Clears Process State**: Ensures clean slate for new processing runs
4. **Preserves Development Servers**: Keeps `pnpm dev` servers running

## Use Cases

- **Before New Ingestion**: Clear all processing jobs before starting fresh document ingestion
- **Stuck Processes**: Resolve hung or stuck processing jobs
- **Pipeline Reset**: Clean state after processing errors or interruptions
- **Resource Cleanup**: Free up system resources from long-running extraction jobs

## Implementation

The command performs these cleanup operations:

1. **Kill Processing Scripts**:
   ```bash
   pkill -f "process-documents.ts"
   pgrep -f "npx tsx.*process-documents.ts" | xargs kill -9
   ```

2. **Clean Background Shells**: Identifies and terminates background bash shells running document processing commands

3. **Preserve Development**: Keeps essential development servers (pnpm dev) running

4. **Status Report**: Reports on terminated processes and cleanup results

## Safety

- Only targets document processing jobs, not system processes
- Preserves development servers and essential background tasks
- Provides confirmation of cleanup operations
- Safe to run multiple times (idempotent)

## Example Output

```
🧹 Resetting document processing jobs...

✅ Killed 3 processing scripts
✅ Cleaned 5 background shells
✅ Preserved development servers
🎯 Ready for fresh ingestion run
```

Use this command when you need to start document processing from a completely clean state.