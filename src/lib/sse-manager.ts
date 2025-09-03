// Shared SSE connection manager
type SSEWriter = {
  write: (data: any) => void;
  close: () => void;
};

// Store active SSE connections globally - use globalThis to survive HMR
declare global {
  var sseConnections: Map<string, SSEWriter> | undefined;
}

// Initialize or reuse existing connections Map to survive Hot Module Reloading
const connections = globalThis.sseConnections ?? new Map<string, SSEWriter>();
if (!globalThis.sseConnections) {
  globalThis.sseConnections = connections;
  console.log("🌍 Initialized global SSE connections Map");
} else {
  console.log(
    `🔄 Reusing existing SSE connections Map with ${connections.size} connections`
  );
}

export function addSSEConnection(userId: string, writer: SSEWriter) {
  connections.set(userId, writer);
  console.log(`\n📡 === SSE CONNECTION ADDED ===`);
  console.log(`📡 User ID: ${userId}`);
  console.log(`📡 Total connections after add: ${connections.size}`);
  console.log(
    `📡 All active user IDs: [${Array.from(connections.keys()).join(", ")}]`
  );
  console.log(`🕐 Add timestamp: ${new Date().toISOString()}`);
  console.log(`📡 === END ADD ===\n`);
}

export function removeSSEConnection(userId: string) {
  const hadConnection = connections.has(userId);
  connections.delete(userId);
  console.log(`\n🔌 === SSE CONNECTION REMOVED ===`);
  console.log(`🔌 User ID: ${userId}`);
  console.log(`🔌 Had connection before removal: ${hadConnection}`);
  console.log(`🔌 Total connections after removal: ${connections.size}`);
  console.log(
    `🔌 Remaining user IDs: [${Array.from(connections.keys()).join(", ")}]`
  );
  console.log(`🕐 Remove timestamp: ${new Date().toISOString()}`);
  console.trace(`🔍 Removal stack trace:`);
  console.log(`🔌 === END REMOVE ===\n`);
}

export function sendTitleUpdate(
  userId: string,
  data: { conversationId: string; title: string }
) {
  const connection = connections.get(userId);
  if (connection) {
    try {
      const message = {
        type: "title-update",
        conversationId: data.conversationId,
        title: data.title,
        timestamp: new Date().toISOString(),
      };

      connection.write(message);
      console.log(`📡 Sent title update to user ${userId}: "${data.title}"`);
      return true;
    } catch (error) {
      console.error(`Failed to send title update to user ${userId}:`, error);
      // Remove broken connection
      connections.delete(userId);
      return false;
    }
  } else {
    console.warn(`❌ No SSE connection found for user ${userId}`);
    console.warn(`📊 Available connections: ${Array.from(connections.keys())}`);
    console.warn(`📊 Total connections: ${connections.size}`);
    return false;
  }
}

export function getActiveConnections() {
  return Array.from(connections.keys());
}
