/**
 * Test page for DELETE conversation functionality
 * Use this to manually test the RLS policy fix
 */
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react'

interface TestResult {
  step: string
  status: 'pending' | 'success' | 'error'
  message: string
  details?: any
}

export default function TestDeletePage() {
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<TestResult[]>([])

  const addResult = (step: string, status: TestResult['status'], message: string, details?: any) => {
    setResults(prev => [...prev, { step, status, message, details }])
  }

  const testDeleteConversation = async () => {
    setTesting(true)
    setResults([])

    try {
      // Step 1: Create a test conversation
      addResult('Create Test Conversation', 'pending', 'Creating a test conversation...')
      
      const createResponse = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Delete Conversation' })
      })

      if (!createResponse.ok) {
        const error = await createResponse.text()
        addResult('Create Test Conversation', 'error', `Failed to create: ${createResponse.status}`, error)
        setTesting(false)
        return
      }

      const conversation = await createResponse.json()
      addResult('Create Test Conversation', 'success', `Created conversation: ${conversation.id}`)

      // Step 2: List conversations to verify it exists
      addResult('Verify Conversation Exists', 'pending', 'Checking conversation appears in list...')
      
      const listResponse = await fetch('/api/conversations')
      if (!listResponse.ok) {
        addResult('Verify Conversation Exists', 'error', `Failed to list: ${listResponse.status}`)
        setTesting(false)
        return
      }

      const conversations = await listResponse.json()
      const foundConversation = conversations.find((c: any) => c.id === conversation.id)
      
      if (foundConversation) {
        addResult('Verify Conversation Exists', 'success', 'Test conversation found in list')
      } else {
        addResult('Verify Conversation Exists', 'error', 'Test conversation not found in list')
        setTesting(false)
        return
      }

      // Step 3: Attempt to delete the conversation (soft delete)
      addResult('Delete Conversation', 'pending', 'Attempting to delete conversation...')
      
      const deleteResponse = await fetch(`/api/conversations/${conversation.id}`, {
        method: 'DELETE'
      })

      if (!deleteResponse.ok) {
        const error = await deleteResponse.text()
        addResult('Delete Conversation', 'error', `Delete failed: ${deleteResponse.status}`, error)
        
        // This is the main test - if this fails, the RLS policy fix is needed
        if (deleteResponse.status === 500) {
          addResult('RLS Policy Status', 'error', 'RLS policy fix still needed - apply MANUAL_DB_FIX.md')
        }
        setTesting(false)
        return
      }

      addResult('Delete Conversation', 'success', 'Conversation deleted successfully')

      // Step 4: Verify conversation no longer appears in list
      addResult('Verify Deletion', 'pending', 'Checking conversation is hidden from list...')
      
      const verifyResponse = await fetch('/api/conversations')
      if (!verifyResponse.ok) {
        addResult('Verify Deletion', 'error', `Failed to verify: ${verifyResponse.status}`)
        setTesting(false)
        return
      }

      const updatedConversations = await verifyResponse.json()
      const deletedConversationStillExists = updatedConversations.find((c: any) => c.id === conversation.id)
      
      if (deletedConversationStillExists) {
        addResult('Verify Deletion', 'error', 'Deleted conversation still appears in list')
      } else {
        addResult('Verify Deletion', 'success', 'Deleted conversation properly hidden from list')
      }

      addResult('Overall Result', 'success', 'DELETE conversation functionality working correctly!')

    } catch (error) {
      addResult('Test Error', 'error', 'Test failed with exception', error)
    }

    setTesting(false)
  }

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'error': return <XCircle className="w-5 h-5 text-red-500" />
      case 'pending': return <AlertCircle className="w-5 h-5 text-yellow-500 animate-pulse" />
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-6 h-6" />
            DELETE Conversation RLS Test
          </CardTitle>
          <CardDescription>
            This page tests the DELETE conversation functionality to verify the RLS policy fix is working.
            <br />You must be logged in for this test to work.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Button 
              onClick={testDeleteConversation}
              disabled={testing}
              size="lg"
              className="w-full"
            >
              {testing ? 'Running Tests...' : 'Test DELETE Conversation'}
            </Button>

            {results.length > 0 && (
              <div className="space-y-2 mt-6">
                <h3 className="font-semibold text-lg">Test Results:</h3>
                {results.map((result, index) => (
                  <div 
                    key={index} 
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      result.status === 'success' ? 'bg-green-50 border-green-200' :
                      result.status === 'error' ? 'bg-red-50 border-red-200' :
                      'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    {getStatusIcon(result.status)}
                    <div className="flex-1">
                      <div className="font-medium">{result.step}</div>
                      <div className="text-sm text-gray-600">{result.message}</div>
                      {result.details && (
                        <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto">
                          {typeof result.details === 'string' ? result.details : JSON.stringify(result.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-blue-900">Expected Behavior:</h4>
              <ul className="text-sm text-blue-800 mt-2 space-y-1">
                <li>✅ Create test conversation successfully</li>
                <li>✅ Test conversation appears in conversation list</li>
                <li>✅ DELETE API returns 200 (not 500 RLS error)</li>
                <li>✅ Deleted conversation disappears from list</li>
              </ul>
              
              <h4 className="font-semibold text-blue-900 mt-4">If DELETE fails with 500 error:</h4>
              <p className="text-sm text-blue-800 mt-1">
                The RLS policy fix needs to be applied manually. See <code>MANUAL_DB_FIX.md</code> for instructions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
