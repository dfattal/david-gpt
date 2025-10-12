// Simple in-memory store for SSE connections
// In production, you'd use Redis or another pub/sub system
const connections = new Map<string, Array<{ controller: ReadableStreamDefaultController; userId: string }>>();

export function addSSEConnection(userId: string, controller: ReadableStreamDefaultController) {
  if (!connections.has(userId)) {
    connections.set(userId, []);
  }
  connections.get(userId)!.push({ controller, userId });

  console.log(`📡 Added SSE connection for user ${userId}. Total connections: ${connections.get(userId)!.length}`);
}

export function removeSSEConnection(userId: string, controller: ReadableStreamDefaultController) {
  const userConnections = connections.get(userId);
  if (userConnections) {
    const index = userConnections.findIndex(conn => conn.controller === controller);
    if (index !== -1) {
      userConnections.splice(index, 1);
      console.log(`📡 Removed SSE connection for user ${userId}. Remaining connections: ${userConnections.length}`);

      if (userConnections.length === 0) {
        connections.delete(userId);
      }
    }
  }
}

export function broadcastToUser(userId: string, event: { type: string; [key: string]: any }): boolean {
  const userConnections = connections.get(userId);
  if (!userConnections || userConnections.length === 0) {
    console.log(`📡 No SSE connections found for user ${userId}`);
    return false;
  }

  const data = JSON.stringify(event);
  const deadConnections: Array<{ controller: ReadableStreamDefaultController; userId: string }> = [];
  let successCount = 0;

  userConnections.forEach(({ controller, userId: connUserId }) => {
    try {
      controller.enqueue(`data: ${data}\n\n`);
      console.log(`📡 Broadcasted ${event.type} event to user ${connUserId}`);
      successCount++;
    } catch (error) {
      console.error(`📡 Failed to send to connection for user ${connUserId}:`, error);
      deadConnections.push({ controller, userId: connUserId });
    }
  });

  // Clean up dead connections
  deadConnections.forEach(({ controller, userId: connUserId }) => {
    removeSSEConnection(connUserId, controller);
  });

  return successCount > 0;
}

export function broadcastTitleUpdate(userId: string, conversationId: string, title: string) {
  // Try to broadcast immediately
  const success = broadcastToUser(userId, {
    type: 'title-update',
    conversationId,
    title,
    timestamp: new Date().toISOString()
  });

  // If no connections found, retry multiple times with increasing delays
  if (!success) {
    console.log(`📡 SSE connection not ready, scheduling retries for user ${userId}`);

    // Retry strategy: 1s, 2s, 4s, 6s (total 4 retries over 13 seconds)
    const retryDelays = [1000, 2000, 4000, 6000];

    retryDelays.forEach((delay) => {
      setTimeout(() => {
        const retrySuccess = broadcastToUser(userId, {
          type: 'title-update',
          conversationId,
          title,
          timestamp: new Date().toISOString()
        });

        if (retrySuccess) {
          console.log(`✅ Title broadcast succeeded on retry after ${delay}ms`);
        }
      }, delay);
    });
  } else {
    console.log(`✅ Title broadcast succeeded immediately for user ${userId}`);
  }
}