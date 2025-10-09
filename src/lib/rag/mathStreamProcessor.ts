/**
 * Math Stream Processor
 *
 * Normalizes LaTeX delimiters in streaming text from \(...\) and \[...\]
 * to $...$ and $$...$$ format expected by remark-math/rehype-katex.
 *
 * Handles chunk boundaries gracefully to avoid breaking delimiters mid-stream.
 */

/**
 * Transform stream that normalizes math delimiters on the fly
 * @param stream - Async iterable of text chunks (e.g., from Vercel AI SDK)
 * @yields Normalized text chunks with corrected math delimiters
 */
export async function* normalizeMathStream(
  stream: AsyncIterable<string>
): AsyncIterable<string> {
  // Buffer to handle delimiters that might split across chunks
  let buffer = "";

  for await (const chunk of stream) {
    buffer += chunk;

    // Replace inline \( ... \) → $...$
    // Trim spaces around the expression for cleaner rendering
    buffer = buffer.replace(/\\\(\s*(.*?)\s*\\\)/gs, (_match, expr) => `$${expr}$`);

    // Replace display \[ ... \] → $$...$$
    // Ensure block math is on its own line with proper newlines
    buffer = buffer.replace(/\\\[\s*(.*?)\s*\\\]/gs, (_match, expr) => {
      // Add newlines before and after if not already present
      return `\n$$\n${expr}\n$$\n`;
    });

    // Yield all except last 20 chars to avoid cutting mid-delimiter
    // This "safe zone" ensures we don't break \(...\) or \[...\] across chunks
    const safeLength = Math.max(0, buffer.length - 20);
    if (safeLength > 0) {
      yield buffer.slice(0, safeLength);
      buffer = buffer.slice(safeLength);
    }
  }

  // Flush remaining buffer with final replacement sweep
  if (buffer.length > 0) {
    buffer = buffer.replace(/\\\(\s*(.*?)\s*\\\)/gs, (_match, expr) => `$${expr}$`);
    buffer = buffer.replace(/\\\[\s*(.*?)\s*\\\]/gs, (_match, expr) => `\n$$\n${expr}\n$$\n`);
    yield buffer;
  }
}

/**
 * Wrap a ReadableStream with math normalization
 * Useful for transforming Vercel AI SDK text streams
 */
export function createMathNormalizingStream(
  sourceStream: ReadableStream<string>
): ReadableStream<string> {
  return new ReadableStream({
    async start(controller) {
      try {
        // Convert ReadableStream to async iterable
        const reader = sourceStream.getReader();

        async function* readStream() {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              yield value;
            }
          } finally {
            reader.releaseLock();
          }
        }

        // Process through normalizer
        for await (const normalizedChunk of normalizeMathStream(readStream())) {
          controller.enqueue(normalizedChunk);
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
