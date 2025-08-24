import { test, expect } from '@playwright/test'
import { sendMessageAndWait, mockApiResponses, TEST_DATA } from './helpers/test-utils'

test.describe('Title Generation', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('auth-state', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com' },
        session: { access_token: 'mock-token' }
      }))
    })
    
    // Mock empty conversations initially
    await page.route('**/api/conversations', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversations: [] })
        })
      } else if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation: {
              id: 'new-conv-123',
              title: 'New Conversation',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          })
        })
      }
    })
    
    await mockApiResponses(page)
    await page.goto('/')
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
  })

  test('should automatically generate title after first exchange', async ({ page }) => {
    let titleGenerated = false
    
    // Mock title generation API
    await page.route('**/api/conversations/*/title', async route => {
      titleGenerated = true
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: {
            id: 'new-conv-123',
            title: 'Tech Startup Strategy',
            updated_at: new Date().toISOString()
          }
        })
      })
    })
    
    // Create new conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Send first message
    await sendMessageAndWait(page, 'What are the key strategies for building a successful tech startup?')
    
    // Should trigger title generation
    await page.waitForTimeout(1000) // Allow for background processing
    
    expect(titleGenerated).toBe(true)
    
    // Should update conversation title in sidebar
    await expect(page.locator('text=Tech Startup Strategy')).toBeVisible({ timeout: 5000 })
  })

  test('should show loading state during title generation', async ({ page }) => {
    // Mock slow title generation
    await page.route('**/api/conversations/*/title', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: {
            id: 'new-conv-123',
            title: 'Business Model Innovation',
            updated_at: new Date().toISOString()
          }
        })
      })
    })
    
    // Create new conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Send first message
    await sendMessageAndWait(page, 'How do I create an innovative business model?')
    
    // Should show loading indicator for title
    await expect(page.locator('[data-testid="title-loading"], [data-testid="generating-title"], text=Generating')).toBeVisible()
    
    // Should eventually show generated title
    await expect(page.locator('text=Business Model Innovation')).toBeVisible({ timeout: 5000 })
    
    // Loading indicator should disappear
    await expect(page.locator('[data-testid="title-loading"], [data-testid="generating-title"]')).not.toBeVisible()
  })

  test('should handle title generation errors gracefully', async ({ page }) => {
    // Mock API error for title generation
    await page.route('**/api/conversations/*/title', async route => {
      await route.fulfill({
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Title generation failed' })
      })
    })
    
    // Create new conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Send first message
    await sendMessageAndWait(page, 'What should I focus on as a first-time entrepreneur?')
    
    // Should fallback to default title or show error state
    await Promise.race([
      expect(page.locator('text=New Conversation')).toBeVisible({ timeout: 5000 }),
      expect(page.locator('[data-testid="title-error"], text=Error generating title')).toBeVisible({ timeout: 5000 })
    ])
    
    // Should have retry option if error is shown
    const retryButton = page.locator('[data-testid="retry-title"], text=Retry')
    if (await retryButton.isVisible()) {
      await expect(retryButton).toBeEnabled()
    }
  })

  test('should generate contextually relevant titles', async ({ page }) => {
    const testScenarios = [
      {
        message: 'How do I raise venture capital for my SaaS startup?',
        expectedKeywords: ['Venture', 'Capital', 'SaaS', 'Funding']
      },
      {
        message: 'What are the best practices for scaling a development team?',
        expectedKeywords: ['Scaling', 'Development', 'Team', 'Growth']
      },
      {
        message: 'How should I approach product-market fit validation?',
        expectedKeywords: ['Product', 'Market', 'Fit', 'Validation']
      }
    ]
    
    for (const [index, scenario] of testScenarios.entries()) {
      // Mock contextual title generation
      await page.route('**/api/conversations/*/title', async route => {
        // Generate title based on keywords
        const relevantTitle = scenario.expectedKeywords.slice(0, 3).join(' ')
        
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation: {
              id: `conv-${index}`,
              title: relevantTitle,
              updated_at: new Date().toISOString()
            }
          })
        })
      })
      
      // Create new conversation for each test
      await page.locator('[data-testid="new-conversation-button"]').click()
      
      // Send contextual message
      await sendMessageAndWait(page, scenario.message)
      
      // Should generate relevant title containing keywords
      const generatedTitle = await page.locator('[data-testid="conversation-item"]').last().textContent()
      
      // Check that title contains at least one expected keyword
      const titleContainsKeyword = scenario.expectedKeywords.some(keyword => 
        generatedTitle?.toLowerCase().includes(keyword.toLowerCase())
      )
      
      expect(titleContainsKeyword).toBe(true)
    }
  })

  test('should format titles correctly (Title Case, 3-6 words)', async ({ page }) => {
    // Mock title generation with proper formatting
    await page.route('**/api/conversations/*/title', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: {
            id: 'new-conv-123',
            title: 'Startup Growth Strategy',
            updated_at: new Date().toISOString()
          }
        })
      })
    })
    
    // Create new conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Send message
    await sendMessageAndWait(page, 'How do I grow my startup effectively?')
    
    // Wait for title generation
    const titleElement = await page.waitForSelector('text=Startup Growth Strategy')
    const title = await titleElement.textContent()
    
    // Verify Title Case formatting
    const words = title?.split(' ') || []
    expect(words.length).toBeGreaterThanOrEqual(3)
    expect(words.length).toBeLessThanOrEqual(6)
    
    // Check Title Case (first letter of each word capitalized)
    for (const word of words) {
      if (word.length > 0) {
        expect(word[0]).toBe(word[0].toUpperCase())
      }
    }
  })

  test('should not regenerate title for existing conversations', async ({ page }) => {
    let titleGenerationCalls = 0
    
    // Track title generation calls
    await page.route('**/api/conversations/*/title', async route => {
      titleGenerationCalls++
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: {
            id: 'new-conv-123',
            title: 'Initial Title',
            updated_at: new Date().toISOString()
          }
        })
      })
    })
    
    // Create new conversation and generate initial title
    await page.locator('[data-testid="new-conversation-button"]').click()
    await sendMessageAndWait(page, 'First message')
    
    // Wait for initial title generation
    await expect(page.locator('text=Initial Title')).toBeVisible()
    expect(titleGenerationCalls).toBe(1)
    
    // Send another message in same conversation
    await sendMessageAndWait(page, 'Second message in same conversation')
    
    // Should not trigger another title generation
    await page.waitForTimeout(2000)
    expect(titleGenerationCalls).toBe(1) // Should still be 1
  })

  test('should handle rate limiting gracefully', async ({ page }) => {
    // Mock rate limit response
    await page.route('**/api/conversations/*/title', async route => {
      await route.fulfill({
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'Retry-After': '60'
        },
        body: JSON.stringify({ error: 'Rate limit exceeded' })
      })
    })
    
    // Create new conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Send message
    await sendMessageAndWait(page, 'This should trigger rate limiting')
    
    // Should show rate limit message or fallback behavior
    await Promise.race([
      expect(page.locator('text=New Conversation')).toBeVisible(), // Fallback to default
      expect(page.locator('[data-testid="rate-limit-message"]')).toBeVisible(),
      expect(page.locator('text=Rate limit')).toBeVisible()
    ])
  })

  test('should retry failed title generation', async ({ page }) => {
    let attemptCount = 0
    
    // Mock failing then succeeding
    await page.route('**/api/conversations/*/title', async route => {
      attemptCount++
      
      if (attemptCount === 1) {
        // First attempt fails
        await route.fulfill({
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Server error' })
        })
      } else {
        // Retry succeeds
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation: {
              id: 'new-conv-123',
              title: 'Success After Retry',
              updated_at: new Date().toISOString()
            }
          })
        })
      }
    })
    
    // Create new conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Send message
    await sendMessageAndWait(page, 'This should trigger retry logic')
    
    // Should eventually show successful title after retry
    await expect(page.locator('text=Success After Retry')).toBeVisible({ timeout: 10000 })
    
    // Should have made 2 attempts
    expect(attemptCount).toBe(2)
  })

  test('should generate titles in background without blocking chat', async ({ page }) => {
    // Mock slow title generation
    await page.route('**/api/conversations/*/title', async route => {
      await new Promise(resolve => setTimeout(resolve, 3000))
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: {
            id: 'new-conv-123',
            title: 'Background Generated Title',
            updated_at: new Date().toISOString()
          }
        })
      })
    })
    
    // Create new conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Send first message
    await sendMessageAndWait(page, 'First message to trigger title generation')
    
    // Should be able to send second message immediately (not blocked)
    await sendMessageAndWait(page, 'Second message while title is being generated')
    
    // Both messages should be visible
    await expect(page.locator('[data-testid="user-message"]')).toHaveCount(2)
    
    // Title should eventually appear
    await expect(page.locator('text=Background Generated Title')).toBeVisible({ timeout: 5000 })
  })

  test('should preserve manual title changes', async ({ page }) => {
    // Create conversation with auto-generated title first
    await page.route('**/api/conversations/*/title', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: {
            id: 'new-conv-123',
            title: 'Auto Generated Title',
            updated_at: new Date().toISOString()
          }
        })
      })
    })
    
    await page.locator('[data-testid="new-conversation-button"]').click()
    await sendMessageAndWait(page, 'Initial message')
    
    // Wait for auto-generated title
    await expect(page.locator('text=Auto Generated Title')).toBeVisible()
    
    // Mock rename API
    await page.route('**/api/conversations/new-conv-123', async route => {
      if (route.request().method() === 'PATCH') {
        const body = await route.request().postDataJSON()
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation: {
              id: 'new-conv-123',
              title: body.title,
              updated_at: new Date().toISOString()
            }
          })
        })
      }
    })
    
    // Manually rename the conversation
    const conversationItem = page.locator('[data-testid="conversation-item"]:has-text("Auto Generated Title")')
    await conversationItem.click({ button: 'right' })
    await page.locator('[data-testid="rename-conversation"], text=Rename').click()
    
    const renameInput = page.locator('[data-testid="rename-input"]')
    await renameInput.clear()
    await renameInput.fill('My Custom Title')
    await renameInput.press('Enter')
    
    // Should show custom title
    await expect(page.locator('text=My Custom Title')).toBeVisible()
    
    // Send another message - should not override custom title
    await sendMessageAndWait(page, 'Another message after manual rename')
    
    // Custom title should remain
    await page.waitForTimeout(2000)
    await expect(page.locator('text=My Custom Title')).toBeVisible()
    await expect(page.locator('text=Auto Generated Title')).not.toBeVisible()
  })
})
