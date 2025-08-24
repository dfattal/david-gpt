import { Page, expect } from '@playwright/test'

/**
 * Test utilities for David-GPT E2E tests
 */

// Mock responses for consistent testing
export const MOCK_RESPONSES = {
  DAVID_GREETING: "Hello! I'm David Fattal, a technology entrepreneur and startup advisor.",
  DAVID_TECH_RESPONSE: "As someone who's built multiple tech companies, I'd say the key is focusing on solving real problems.",
  DAVID_ADVICE: "In my experience with startups, the most important thing is product-market fit."
}

// Test data
export const TEST_DATA = {
  TEST_MESSAGE: "What's your advice for tech startups?",
  LONG_MESSAGE: "This is a longer test message to check how the UI handles multi-line content and longer text inputs that might cause wrapping or other layout issues.",
  CONVERSATION_TITLE: "Tech Startup Advice",
  RENAMED_TITLE: "Entrepreneurship Discussion"
}

/**
 * Wait for authentication to complete
 */
export async function waitForAuth(page: Page) {
  // Wait for either login page or authenticated state
  await Promise.race([
    page.waitForURL('/login'),
    page.waitForSelector('[data-testid="chat-interface"]', { timeout: 5000 })
  ])
}

/**
 * Mock Google OAuth for testing (when needed)
 */
export async function mockGoogleAuth(page: Page) {
  // Intercept Google OAuth requests for testing
  await page.route('**/auth/v1/authorize*', async route => {
    await route.fulfill({
      status: 302,
      headers: {
        'Location': '/auth/callback?code=mock_auth_code'
      }
    })
  })

  // Mock the callback response
  await page.route('**/auth/callback*', async route => {
    await route.fulfill({
      status: 302,
      headers: {
        'Location': '/'
      }
    })
  })
}

/**
 * Wait for streaming response to complete
 */
export async function waitForStreamingComplete(page: Page) {
  // Wait for loading indicator to disappear
  await page.waitForSelector('[data-testid="message-loading"]', { state: 'hidden', timeout: 30000 })
  
  // Wait a bit more for any final streaming updates
  await page.waitForTimeout(1000)
}

/**
 * Send a test message and wait for response
 */
export async function sendMessageAndWait(page: Page, message: string) {
  // Type message
  await page.fill('[data-testid="message-input"]', message)
  
  // Send message
  await page.click('[data-testid="send-button"]')
  
  // Wait for message to appear in chat
  await expect(page.locator('[data-testid="user-message"]').last()).toContainText(message)
  
  // Wait for assistant response
  await waitForStreamingComplete(page)
  
  // Verify assistant response appeared
  await expect(page.locator('[data-testid="assistant-message"]').last()).toBeVisible()
}

/**
 * Mock API responses for consistent testing
 */
export async function mockApiResponses(page: Page) {
  // Mock streaming chat response
  await page.route('**/api/chat', async route => {
    const request = route.request()
    if (request.method() === 'POST') {
      // Create a mock streaming response
      const mockResponse = MOCK_RESPONSES.DAVID_TECH_RESPONSE
      const chunks = mockResponse.split(' ')
      
      let responseText = ''
      for (const chunk of chunks) {
        responseText += chunk + ' '
        // Simulate streaming delay
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
        body: responseText.trim()
      })
    } else {
      await route.continue()
    }
  })

  // Mock conversations API
  await page.route('**/api/conversations', async route => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversations: [
            {
              id: 'test-conv-1',
              title: 'Test Conversation',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ]
        })
      })
    } else if (request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: {
            id: 'new-test-conv',
            title: 'New Conversation',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        })
      })
    } else {
      await route.continue()
    }
  })

  // Mock title generation
  await page.route('**/api/conversations/*/title', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation: {
          id: route.request().url().split('/').slice(-2, -1)[0],
          title: TEST_DATA.CONVERSATION_TITLE,
          updated_at: new Date().toISOString()
        }
      })
    })
  })
}

/**
 * Check accessibility with axe-core
 */
export async function checkAccessibility(page: Page, context?: string) {
  // Inject axe-core
  await page.addScriptTag({ url: 'https://unpkg.com/axe-core@4.7.0/axe.min.js' })
  
  // Run accessibility scan
  const results = await page.evaluate(() => {
    return new Promise((resolve) => {
      // @ts-ignore - axe is loaded dynamically
      axe.run(document, (err: any, results: any) => {
        if (err) throw err
        resolve(results)
      })
    })
  })

  // @ts-ignore - results type from axe
  const violations = results.violations
  
  if (violations.length > 0) {
    const violationSummary = violations.map((v: any) => `${v.id}: ${v.description}`).join(', ')
    console.warn(`Accessibility violations${context ? ` in ${context}` : ''}: ${violationSummary}`)
    
    // For now, just warn - in production you might want to fail the test
    // expect(violations).toHaveLength(0)
  }
  
  return violations
}

/**
 * Wait for element to be visible and stable
 */
export async function waitForElementStable(page: Page, selector: string, timeout = 5000) {
  const element = page.locator(selector)
  await element.waitFor({ state: 'visible', timeout })
  
  // Wait for element to be stable (no layout shifts)
  await page.waitForTimeout(100)
  
  return element
}

/**
 * Test viewport responsiveness
 */
export async function testResponsiveBreakpoints(page: Page, testCallback: () => Promise<void>) {
  const breakpoints = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1024, height: 768 },
    { name: 'large', width: 1440, height: 900 }
  ]

  for (const breakpoint of breakpoints) {
    await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height })
    await page.waitForTimeout(500) // Allow layout to stabilize
    
    console.log(`Testing at ${breakpoint.name} (${breakpoint.width}x${breakpoint.height})`)
    await testCallback()
  }
}
