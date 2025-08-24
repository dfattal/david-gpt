import { test, expect } from '@playwright/test'
import { mockApiResponses, sendMessageAndWait, testResponsiveBreakpoints } from './helpers/test-utils'

test.describe('Responsive Design', () => {
  const breakpoints = {
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1024, height: 768 },
    large: { width: 1440, height: 900 }
  }

  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('auth-state', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com' },
        session: { access_token: 'mock-token' }
      }))
    })
    
    await mockApiResponses(page)
  })

  test('should adapt layout across all breakpoints', async ({ page }) => {
    await testResponsiveBreakpoints(page, async () => {
      await page.goto('/')
      await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
      
      const viewport = page.viewportSize()
      const width = viewport?.width || 0
      
      // Check main layout adaptation
      const chatInterface = page.locator('[data-testid="chat-interface"]')
      const sidebar = page.locator('[data-testid="conversation-sidebar"]')
      
      await expect(chatInterface).toBeVisible()
      
      if (width < 768) {
        // Mobile: sidebar might be hidden/collapsible
        const hamburger = page.locator('[data-testid="menu-toggle"], [data-testid="sidebar-toggle"]')
        if (await hamburger.isVisible()) {
          // Test mobile navigation
          await hamburger.click()
          await expect(sidebar).toBeVisible()
          
          // Close sidebar
          await hamburger.click()
        }
      } else {
        // Desktop/tablet: sidebar should be visible
        await expect(sidebar).toBeVisible()
      }
    })
  })

  test('mobile layout should be touch-friendly', async ({ page }) => {
    await page.setViewportSize(breakpoints.mobile)
    await page.goto('/')
    
    // Check touch target sizes (minimum 44x44px)
    const touchTargets = [
      '[data-testid="new-conversation-button"]',
      '[data-testid="send-button"]',
      '[data-testid="conversation-item"]'
    ]
    
    for (const selector of touchTargets) {
      const element = page.locator(selector).first()
      if (await element.isVisible()) {
        const box = await element.boundingBox()
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(40)
          expect(box.height).toBeGreaterThanOrEqual(32)
        }
      }
    }
    
    // Test message input on mobile
    const messageInput = page.locator('[data-testid="message-input"]')
    await expect(messageInput).toBeVisible()
    
    // Should be easy to tap and type on
    await messageInput.tap()
    await expect(messageInput).toBeFocused()
    
    // Test scrolling behavior
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Send multiple messages to test scrolling
    for (let i = 1; i <= 3; i++) {
      await sendMessageAndWait(page, `Mobile message ${i}`)
    }
    
    // Latest message should be visible
    await expect(page.locator('[data-testid="user-message"]').last()).toBeInViewport()
  })

  test('tablet layout should optimize space usage', async ({ page }) => {
    await page.setViewportSize(breakpoints.tablet)
    await page.goto('/')
    
    // Check tablet-specific layout
    const sidebar = page.locator('[data-testid="conversation-sidebar"]')
    const chatArea = page.locator('[data-testid="chat-messages"]')
    const messageInput = page.locator('[data-testid="message-input"]')
    
    await expect(sidebar).toBeVisible()
    await expect(chatArea).toBeVisible()
    await expect(messageInput).toBeVisible()
    
    // Check proportions - sidebar shouldn't dominate on tablet
    const sidebarBox = await sidebar.boundingBox()
    const chatBox = await chatArea.boundingBox()
    
    if (sidebarBox && chatBox) {
      const sidebarWidth = sidebarBox.width
      const totalWidth = page.viewportSize()?.width || 768
      const sidebarRatio = sidebarWidth / totalWidth
      
      // Sidebar should be reasonable proportion (not more than 40%)
      expect(sidebarRatio).toBeLessThan(0.4)
    }
    
    // Test tablet interaction patterns
    await page.locator('[data-testid="new-conversation-button"]').click()
    await sendMessageAndWait(page, 'Testing tablet layout')
    
    // Messages should have good readability
    const userMessage = page.locator('[data-testid="user-message"]').last()
    const messageBox = await userMessage.boundingBox()
    
    if (messageBox) {
      // Message shouldn't be too wide for comfortable reading
      expect(messageBox.width).toBeLessThan(600)
    }
  })

  test('desktop layout should maximize productivity', async ({ page }) => {
    await page.setViewportSize(breakpoints.desktop)
    await page.goto('/')
    
    // Desktop should show full interface
    await expect(page.locator('[data-testid="conversation-sidebar"]')).toBeVisible()
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
    
    // Check keyboard shortcuts work well on desktop
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    const messageInput = page.locator('[data-testid="message-input"]')
    await messageInput.fill('Desktop test message')
    
    // Enter should send message
    await messageInput.press('Enter')
    await expect(page.locator('[data-testid="user-message"]').last()).toContainText('Desktop test message')
    
    // Test multi-line input with Shift+Enter
    await messageInput.fill('Line 1')
    await messageInput.press('Shift+Enter')
    await messageInput.type('Line 2')
    
    const inputValue = await messageInput.inputValue()
    expect(inputValue).toContain('\n')
    
    // Check that interface uses available space efficiently
    const chatMessages = page.locator('[data-testid="chat-messages"]')
    const messagesBox = await chatMessages.boundingBox()
    
    if (messagesBox) {
      // Should use substantial portion of viewport height
      const viewportHeight = page.viewportSize()?.height || 768
      expect(messagesBox.height).toBeGreaterThan(viewportHeight * 0.5)
    }
  })

  test('large screen layout should prevent content from becoming too wide', async ({ page }) => {
    await page.setViewportSize(breakpoints.large)
    await page.goto('/')
    
    await page.locator('[data-testid="new-conversation-button"]').click()
    await sendMessageAndWait(page, 'Testing large screen layout with a longer message to check readability')
    
    // Check that content has maximum width constraints
    const chatInterface = page.locator('[data-testid="chat-interface"]')
    const chatBox = await chatInterface.boundingBox()
    
    if (chatBox) {
      // On very large screens, content should be constrained for readability
      const viewportWidth = page.viewportSize()?.width || 1440
      if (viewportWidth > 1200) {
        // Content shouldn't span the entire width
        expect(chatBox.width).toBeLessThan(viewportWidth * 0.9)
      }
    }
    
    // Messages should have comfortable line length
    const messages = page.locator('[data-testid="user-message"], [data-testid="assistant-message"]')
    const messageCount = await messages.count()
    
    for (let i = 0; i < messageCount; i++) {
      const message = messages.nth(i)
      const messageBox = await message.boundingBox()
      
      if (messageBox) {
        // Optimal line length for readability (roughly 45-75 characters)
        expect(messageBox.width).toBeLessThan(800)
      }
    }
  })

  test('sidebar should adapt responsively', async ({ page }) => {
    await testResponsiveBreakpoints(page, async () => {
      await page.goto('/')
      
      const viewport = page.viewportSize()
      const width = viewport?.width || 0
      const sidebar = page.locator('[data-testid="conversation-sidebar"]')
      
      if (width < 768) {
        // Mobile: sidebar behavior
        const hamburger = page.locator('[data-testid="menu-toggle"], [data-testid="sidebar-toggle"]')
        
        if (await hamburger.isVisible()) {
          // Initially hidden on mobile
          await expect(sidebar).not.toBeVisible()
          
          // Toggle to show
          await hamburger.click()
          await expect(sidebar).toBeVisible()
          
          // Should overlay or push content
          const sidebarBox = await sidebar.boundingBox()
          if (sidebarBox) {
            expect(sidebarBox.width).toBeLessThan(width * 0.8) // Reasonable mobile width
          }
        }
      } else {
        // Tablet/desktop: always visible
        await expect(sidebar).toBeVisible()
        
        // Check appropriate sizing
        const sidebarBox = await sidebar.boundingBox()
        if (sidebarBox) {
          const sidebarRatio = sidebarBox.width / width
          expect(sidebarRatio).toBeGreaterThan(0.2) // Not too narrow
          expect(sidebarRatio).toBeLessThan(0.4)   // Not too wide
        }
      }
    })
  })

  test('message bubbles should adapt to screen size', async ({ page }) => {
    const testMessage = 'This is a longer test message that should adapt its width based on the screen size and maintain good readability across different devices.'
    
    await testResponsiveBreakpoints(page, async () => {
      await page.goto('/')
      
      await page.locator('[data-testid="new-conversation-button"]').click()
      await sendMessageAndWait(page, testMessage)
      
      const userMessage = page.locator('[data-testid="user-message"]').last()
      const assistantMessage = page.locator('[data-testid="assistant-message"]').last()
      
      const viewport = page.viewportSize()
      const width = viewport?.width || 0
      
      // Check message bubble sizing
      for (const message of [userMessage, assistantMessage]) {
        if (await message.isVisible()) {
          const messageBox = await message.boundingBox()
          
          if (messageBox) {
            // Message shouldn't be too wide for the screen
            expect(messageBox.width).toBeLessThan(width * 0.9)
            
            // On mobile, allow more width usage
            if (width < 768) {
              expect(messageBox.width).toBeGreaterThan(width * 0.7)
            } else {
              // On larger screens, constrain for readability
              expect(messageBox.width).toBeLessThan(Math.min(width * 0.7, 600))
            }
          }
        }
      }
    })
  })

  test('input area should be responsive', async ({ page }) => {
    await testResponsiveBreakpoints(page, async () => {
      await page.goto('/')
      
      const messageInput = page.locator('[data-testid="message-input"]')
      const sendButton = page.locator('[data-testid="send-button"]')
      
      await expect(messageInput).toBeVisible()
      await expect(sendButton).toBeVisible()
      
      const viewport = page.viewportSize()
      const width = viewport?.width || 0
      
      // Check input sizing
      const inputBox = await messageInput.boundingBox()
      const buttonBox = await sendButton.boundingBox()
      
      if (inputBox && buttonBox) {
        // Input and button should fit comfortably
        const totalWidth = inputBox.width + buttonBox.width
        expect(totalWidth).toBeLessThan(width * 0.95)
        
        if (width < 768) {
          // Mobile: input should take most space, button should be touch-friendly
          expect(buttonBox.width).toBeGreaterThanOrEqual(40)
          expect(buttonBox.height).toBeGreaterThanOrEqual(40)
          expect(inputBox.width).toBeGreaterThan(width * 0.6)
        } else {
          // Desktop: more balanced proportions
          expect(inputBox.width).toBeGreaterThan(width * 0.5)
        }
      }
      
      // Test multi-line input expansion
      const longText = 'Line 1\nLine 2\nLine 3\nLine 4'
      await messageInput.fill(longText)
      
      // Input should expand vertically
      const expandedBox = await messageInput.boundingBox()
      if (expandedBox && inputBox) {
        expect(expandedBox.height).toBeGreaterThan(inputBox.height)
      }
    })
  })

  test('loading states should be responsive', async ({ page }) => {
    // Mock slow response to show loading states
    await page.route('**/api/chat', async route => {
      await new Promise(resolve => setTimeout(resolve, 1500))
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Response after loading'
      })
    })
    
    await testResponsiveBreakpoints(page, async () => {
      await page.goto('/')
      
      await page.locator('[data-testid="new-conversation-button"]').click()
      await page.fill('[data-testid="message-input"]', 'Test loading state')
      await page.click('[data-testid="send-button"]')
      
      // Loading indicator should be visible and appropriately sized
      const loadingIndicator = page.locator('[data-testid="message-loading"], [data-testid="typing-indicator"]')
      
      if (await loadingIndicator.isVisible()) {
        const loadingBox = await loadingIndicator.boundingBox()
        const viewport = page.viewportSize()
        
        if (loadingBox && viewport) {
          // Loading indicator shouldn't dominate the screen
          expect(loadingBox.width).toBeLessThan(viewport.width * 0.5)
          expect(loadingBox.height).toBeLessThan(viewport.height * 0.2)
        }
      }
    })
  })

  test('error states should be responsive', async ({ page }) => {
    // Mock API error
    await page.route('**/api/chat', async route => {
      await route.fulfill({
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server error' })
      })
    })
    
    await testResponsiveBreakpoints(page, async () => {
      await page.goto('/')
      
      await page.locator('[data-testid="new-conversation-button"]').click()
      await page.fill('[data-testid="message-input"]', 'This will cause an error')
      await page.click('[data-testid="send-button"]')
      
      // Error message should be responsive
      const errorMessage = page.locator('[data-testid="error-message"], text=error')
      
      if (await errorMessage.isVisible()) {
        const errorBox = await errorMessage.boundingBox()
        const viewport = page.viewportSize()
        
        if (errorBox && viewport) {
          // Error shouldn't be too wide
          expect(errorBox.width).toBeLessThan(viewport.width * 0.9)
          
          if (viewport.width < 768) {
            // On mobile, error should be clearly visible
            expect(errorBox.width).toBeGreaterThan(viewport.width * 0.6)
          }
        }
      }
    })
  })

  test('navigation should work across all screen sizes', async ({ page }) => {
    await testResponsiveBreakpoints(page, async () => {
      await page.goto('/')
      
      const viewport = page.viewportSize()
      const width = viewport?.width || 0
      
      // Test creating new conversation
      const newConvButton = page.locator('[data-testid="new-conversation-button"]')
      
      if (width < 768) {
        // On mobile, might need to open sidebar first
        const hamburger = page.locator('[data-testid="menu-toggle"], [data-testid="sidebar-toggle"]')
        if (await hamburger.isVisible()) {
          await hamburger.click()
        }
      }
      
      await expect(newConvButton).toBeVisible()
      await newConvButton.click()
      
      // Should work regardless of screen size
      await expect(page.locator('[data-testid="message-input"]')).toBeFocused()
      
      // Test conversation selection
      if (await page.locator('[data-testid="conversation-item"]').count() > 1) {
        await page.locator('[data-testid="conversation-item"]').first().click()
        await expect(page.locator('[data-testid="conversation-item"]').first())
          .toHaveAttribute('data-active', 'true')
      }
    })
  })

  test('should handle orientation changes', async ({ page }) => {
    // Test mobile orientation change
    await page.setViewportSize({ width: 375, height: 667 }) // Portrait
    await page.goto('/')
    
    // Verify portrait layout
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
    
    // Change to landscape
    await page.setViewportSize({ width: 667, height: 375 }) // Landscape
    await page.waitForTimeout(100) // Allow layout to adjust
    
    // Interface should still be functional
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
    
    // Input area should still be accessible
    const messageInput = page.locator('[data-testid="message-input"]')
    await expect(messageInput).toBeVisible()
    
    // Test functionality in landscape
    await page.locator('[data-testid="new-conversation-button"]').click()
    await messageInput.fill('Testing landscape mode')
    await page.click('[data-testid="send-button"]')
    
    await expect(page.locator('[data-testid="user-message"]').last())
      .toContainText('Testing landscape mode')
  })
})
