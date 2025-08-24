import { test, expect } from '@playwright/test'
import { sendMessageAndWait, waitForStreamingComplete, mockApiResponses, checkAccessibility, TEST_DATA, MOCK_RESPONSES } from './helpers/test-utils'

test.describe('Chat Streaming', () => {
  // Setup authenticated state for all tests
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('auth-state', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com' },
        session: { access_token: 'mock-token' }
      }))
    })
    
    // Mock API responses
    await mockApiResponses(page)
    
    await page.goto('/')
    
    // Wait for chat interface to load
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
  })

  test('should display chat interface correctly', async ({ page }) => {
    // Check main layout elements
    await expect(page.locator('[data-testid="conversation-sidebar"]')).toBeVisible()
    await expect(page.locator('[data-testid="chat-messages"]')).toBeVisible()
    await expect(page.locator('[data-testid="message-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="send-button"]')).toBeVisible()
    
    // Check empty state
    await expect(page.locator('[data-testid="empty-state"], text=Start a conversation')).toBeVisible()
  })

  test('should send and receive messages with streaming', async ({ page }) => {
    const testMessage = TEST_DATA.TEST_MESSAGE
    
    // Mock streaming response
    let streamedContent = ''
    await page.route('**/api/chat', async route => {
      // Simulate streaming response
      const mockResponse = MOCK_RESPONSES.DAVID_TECH_RESPONSE
      
      // Create a readable stream simulation
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked'
        },
        body: mockResponse
      })
    })
    
    // Send message
    await page.fill('[data-testid="message-input"]', testMessage)
    await page.click('[data-testid="send-button"]')
    
    // Verify user message appears
    await expect(page.locator('[data-testid="user-message"]').last()).toContainText(testMessage)
    
    // Verify loading indicator appears
    await expect(page.locator('[data-testid="message-loading"]')).toBeVisible()
    
    // Wait for streaming to complete
    await waitForStreamingComplete(page)
    
    // Verify assistant response
    await expect(page.locator('[data-testid="assistant-message"]').last()).toBeVisible()
    await expect(page.locator('[data-testid="assistant-message"]').last()).toContainText('David')
    
    // Verify input is cleared and re-enabled
    await expect(page.locator('[data-testid="message-input"]')).toHaveValue('')
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled()
  })

  test('should handle long messages correctly', async ({ page }) => {
    const longMessage = TEST_DATA.LONG_MESSAGE
    
    // Send long message
    await page.fill('[data-testid="message-input"]', longMessage)
    await page.click('[data-testid="send-button"]')
    
    // Verify message appears with proper formatting
    const userMessage = page.locator('[data-testid="user-message"]').last()
    await expect(userMessage).toContainText(longMessage)
    
    // Check text wrapping
    const messageBox = await userMessage.boundingBox()
    expect(messageBox?.height).toBeGreaterThan(60) // Should wrap to multiple lines
  })

  test('should show David Fattal persona in responses', async ({ page }) => {
    // Mock response with David's persona
    await page.route('**/api/chat', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: MOCK_RESPONSES.DAVID_GREETING
      })
    })
    
    await sendMessageAndWait(page, 'Hello, who are you?')
    
    // Verify response contains David's persona
    const response = page.locator('[data-testid="assistant-message"]').last()
    await expect(response).toContainText('David Fattal')
    await expect(response).toContainText('entrepreneur')
  })

  test('should handle streaming errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('**/api/chat', async route => {
      await route.fulfill({
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Internal server error' })
      })
    })
    
    await page.fill('[data-testid="message-input"]', 'Test message')
    await page.click('[data-testid="send-button"]')
    
    // Should show error state
    await expect(page.locator('[data-testid="error-message"], text=error')).toBeVisible()
    
    // Input should be re-enabled for retry
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled()
  })

  test('should handle network timeout', async ({ page }) => {
    // Mock slow response
    await page.route('**/api/chat', async route => {
      await new Promise(resolve => setTimeout(resolve, 35000)) // Longer than typical timeout
      await route.continue()
    })
    
    await page.fill('[data-testid="message-input"]', 'Test message')
    await page.click('[data-testid="send-button"]')
    
    // Should show timeout or error handling
    await expect(page.locator('[data-testid="error-message"], text=timeout, text=error')).toBeVisible({ timeout: 40000 })
  })

  test('should support keyboard shortcuts', async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]')
    
    // Test Enter to send
    await messageInput.fill('Test message')
    await messageInput.press('Enter')
    
    // Should send the message
    await expect(page.locator('[data-testid="user-message"]').last()).toContainText('Test message')
    
    // Test Shift+Enter for new line (if supported)
    await messageInput.fill('Line 1')
    await messageInput.press('Shift+Enter')
    await messageInput.type('Line 2')
    
    // Should have multi-line content
    const inputValue = await messageInput.inputValue()
    expect(inputValue).toContain('\n') // Should contain newline
  })

  test('should auto-resize message input', async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]')
    
    // Get initial height
    const initialBox = await messageInput.boundingBox()
    const initialHeight = initialBox?.height || 0
    
    // Add multiple lines of text
    const multiLineText = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5'
    await messageInput.fill(multiLineText)
    
    // Wait for resize
    await page.waitForTimeout(100)
    
    // Should be taller
    const expandedBox = await messageInput.boundingBox()
    const expandedHeight = expandedBox?.height || 0
    
    expect(expandedHeight).toBeGreaterThan(initialHeight)
  })

  test('should disable send button when input is empty', async ({ page }) => {
    const sendButton = page.locator('[data-testid="send-button"]')
    const messageInput = page.locator('[data-testid="message-input"]')
    
    // Initially disabled with empty input
    await expect(sendButton).toBeDisabled()
    
    // Enabled when there's content
    await messageInput.fill('Test')
    await expect(sendButton).toBeEnabled()
    
    // Disabled again when cleared
    await messageInput.clear()
    await expect(sendButton).toBeDisabled()
  })

  test('should persist messages in conversation', async ({ page }) => {
    // Send first message
    await sendMessageAndWait(page, 'First message')
    
    // Send second message
    await sendMessageAndWait(page, 'Second message')
    
    // Both messages should be visible
    await expect(page.locator('[data-testid="user-message"]')).toHaveCount(2)
    await expect(page.locator('[data-testid="assistant-message"]')).toHaveCount(2)
    
    // Messages should be in order
    const userMessages = page.locator('[data-testid="user-message"]')
    await expect(userMessages.first()).toContainText('First message')
    await expect(userMessages.last()).toContainText('Second message')
  })

  test('should scroll to latest message', async ({ page }) => {
    // Add many messages to create scroll
    for (let i = 1; i <= 5; i++) {
      await sendMessageAndWait(page, `Message ${i}`)
    }
    
    // Latest message should be visible (auto-scrolled)
    await expect(page.locator('[data-testid="user-message"]').last()).toBeInViewport()
  })

  test('should show typing indicator during streaming', async ({ page }) => {
    // Mock delayed response to see typing indicator
    await page.route('**/api/chat', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: MOCK_RESPONSES.DAVID_TECH_RESPONSE
      })
    })
    
    await page.fill('[data-testid="message-input"]', 'Test message')
    await page.click('[data-testid="send-button"]')
    
    // Should show typing/loading indicator
    await expect(page.locator('[data-testid="message-loading"], [data-testid="typing-indicator"]')).toBeVisible()
    
    // Wait for response
    await waitForStreamingComplete(page)
    
    // Typing indicator should disappear
    await expect(page.locator('[data-testid="message-loading"], [data-testid="typing-indicator"]')).not.toBeVisible()
  })

  test('should be accessible', async ({ page }) => {
    // Check keyboard navigation
    await page.keyboard.press('Tab')
    
    // Should focus on message input or send button
    const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
    expect(['message-input', 'send-button']).toContain(focusedElement)
    
    // Check ARIA labels
    await expect(page.locator('[data-testid="message-input"]')).toHaveAttribute('aria-label', /.+/)
    await expect(page.locator('[data-testid="send-button"]')).toHaveAttribute('aria-label', /.+/)
    
    // Run accessibility scan
    await checkAccessibility(page, 'chat interface')
  })

  test('should work on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    // Chat interface should be responsive
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
    
    // Message input should be accessible
    const messageInput = page.locator('[data-testid="message-input"]')
    await expect(messageInput).toBeVisible()
    
    // Send button should be properly sized for mobile
    const sendButton = page.locator('[data-testid="send-button"]')
    await expect(sendButton).toBeVisible()
    
    const buttonBox = await sendButton.boundingBox()
    expect(buttonBox?.width).toBeGreaterThan(40) // Should be large enough for mobile touch
    
    // Test mobile interaction
    await messageInput.fill('Mobile test message')
    await sendButton.tap() // Use tap instead of click for mobile
    
    await expect(page.locator('[data-testid="user-message"]').last()).toContainText('Mobile test message')
  })
})
