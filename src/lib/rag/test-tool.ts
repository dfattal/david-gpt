/**
 * Minimal test tool to debug AI SDK v5 + streaming compatibility
 */

import { z } from "zod";
import { tool } from "ai";

/**
 * Simplest possible tool for testing (using inputSchema like in examples)
 */
export const testTool = tool({
  description: "A simple test tool that returns a message",
  inputSchema: z.object({}), // Use inputSchema instead of parameters
  execute: async () => {
    console.log("🧪 Test tool executed!");
    return {
      success: true,
      message: "Test tool executed successfully!",
      timestamp: new Date().toISOString(),
    };
  },
});

/**
 * Export test tools collection
 */
export const testTools = {
  test_tool: testTool,
};