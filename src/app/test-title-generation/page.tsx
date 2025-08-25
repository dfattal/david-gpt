'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface TestConversation {
  id: string
  title: string
  title_status: string
  created_at: string
}

export default function TestTitleGenerationPage() {
  const [conversations, setConversations] = React.useState<TestConversation[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [logs, setLogs] = React.useState<string[]>([])

  const addLog = React.useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
    console.log(`[Test] ${message}`)
  }, [])

  const fetchConversations = React.useCallback(async () => {
    try {
      addLog('Fetching conversations...')
      const response = await fetch('/api/conversations')
      if (response.ok) {
        const data = await response.json()
        setConversations(data.conversations || [])
        addLog(`Fetched ${data.conversations?.length || 0} conversations`)
      } else {
        addLog(`Failed to fetch conversations: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      addLog(`Error fetching conversations: ${error}`)
    }
  }, [addLog])

  const createTestConversation = React.useCallback(async () => {
    setIsLoading(true)
    try {
      addLog('Creating new conversation...')
      
      // Create conversation
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        addLog(`Failed to create conversation: ${response.status} ${response.statusText}`)
        return
      }
      
      const conversation = await response.json()
      addLog(`Created conversation: ${conversation.id}`)
      
      // Send test message to trigger title generation
      const testMessage = [
        {
          id: `user-${Date.now()}`,
          role: 'user',
          parts: [{ type: 'text', text: 'What are the key challenges in developing light field displays for consumer devices?' }],
          createdAt: new Date()
        }
      ]
      
      addLog('Sending test message to trigger chat...')
      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: conversation.id,
          uiMessages: testMessage
        })
      })
      
      if (chatResponse.ok) {
        addLog('Chat request sent successfully')
        
        // Read the streaming response
        const reader = chatResponse.body?.getReader()
        if (reader) {
          let fullResponse = ''
          
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              
              const chunk = new TextDecoder().decode(value)
              fullResponse += chunk
            }
            
            addLog(`Received ${fullResponse.length} characters in response`)
            
            // Wait a bit for title generation to trigger
            setTimeout(() => {
              addLog('Refreshing conversations to check for title generation...')
              fetchConversations()
            }, 3000)
            
          } catch (error) {
            addLog(`Error reading stream: ${error}`)
          }
        }
      } else {
        addLog(`Chat request failed: ${chatResponse.status} ${chatResponse.statusText}`)
      }
      
    } catch (error) {
      addLog(`Error in test: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }, [addLog, fetchConversations])

  const testTitleGeneration = React.useCallback(async (conversationId: string) => {
    try {
      addLog(`Testing manual title generation for ${conversationId}`)
      
      const response = await fetch(`/api/conversations/${conversationId}/title`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (response.ok) {
        const result = await response.json()
        addLog(`Title generation successful: "${result.title}"`)
        fetchConversations()
      } else {
        const error = await response.text()
        addLog(`Title generation failed: ${response.status} - ${error}`)
      }
    } catch (error) {
      addLog(`Error testing title generation: ${error}`)
    }
  }, [addLog, fetchConversations])

  React.useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Title Generation Debug</h1>
        <div className="space-x-2">
          <Button onClick={fetchConversations} variant="outline">
            Refresh
          </Button>
          <Button onClick={createTestConversation} disabled={isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Test Conversation
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversations */}
        <Card>
          <CardHeader>
            <CardTitle>Conversations ({conversations.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {conversations.length === 0 ? (
              <p className="text-muted-foreground">No conversations found</p>
            ) : (
              conversations.map((conv) => (
                <div key={conv.id} className="border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-xs text-muted-foreground">
                      {conv.id.substring(0, 8)}...
                    </div>
                    <Badge variant={
                      conv.title_status === 'ready' ? 'default' :
                      conv.title_status === 'pending' ? 'secondary' : 'destructive'
                    }>
                      {conv.title_status === 'pending' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      {conv.title_status === 'ready' && <CheckCircle className="w-3 h-3 mr-1" />}
                      {conv.title_status === 'error' && <AlertCircle className="w-3 h-3 mr-1" />}
                      {conv.title_status}
                    </Badge>
                  </div>
                  <div className="font-medium">{conv.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Created: {new Date(conv.created_at).toLocaleString()}
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => testTitleGeneration(conv.id)}
                    className="w-full"
                  >
                    Test Title Generation
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Debug Log */}
        <Card>
          <CardHeader>
            <CardTitle>Debug Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-black text-green-400 p-4 rounded font-mono text-xs max-h-96 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="text-muted-foreground">No logs yet...</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index}>{log}</div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>1. Click &ldquo;Create Test Conversation&rdquo; to start a new conversation with a sample message</p>
          <p>2. Watch the debug log for title generation trigger events</p>
          <p>3. Check if the conversation title changes from &ldquo;New chat&rdquo; to something generated</p>
          <p>4. Check the browser network tab for API calls to /api/conversations/[id]/title</p>
          <p>5. Use &ldquo;Test Title Generation&rdquo; to manually trigger title generation for existing conversations</p>
        </CardContent>
      </Card>
    </div>
  )
}