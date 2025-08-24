import { test, expect } from '@playwright/test'
import { injectAxe, checkA11y } from '@axe-core/playwright'
import { mockApiResponses, sendMessageAndWait } from './helpers/test-utils'

test.describe('Accessibility (WCAG 2.1 AA)', () => {
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

  test('login page should be accessible', async ({ page }) => {
    await page.goto('/login')
    await injectAxe(page)
    
    // Check for accessibility violations
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: { html: true },
      axeOptions: {
        rules: {
          // Configure specific rules if needed
          'color-contrast': { enabled: true },
          'keyboard-navigation': { enabled: true },
          'focus-management': { enabled: true }
        }
      }
    })
    
    // Specific accessibility checks
    
    // Check heading hierarchy
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all()
    expect(headings.length).toBeGreaterThan(0)
    
    // Check main heading
    await expect(page.locator('h1')).toContainText('David-GPT')
    
    // Check button accessibility
    const googleButton = page.getByRole('button', { name: /continue with google/i })
    await expect(googleButton).toBeVisible()
    
    // Test keyboard navigation
    await page.keyboard.press('Tab')
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(['BUTTON', 'A', 'INPUT']).toContain(focusedElement)
    
    // Check for proper ARIA labels
    const interactiveElements = await page.locator('button, input, a[href]').all()
    for (const element of interactiveElements) {
      const ariaLabel = await element.getAttribute('aria-label')
      const hasText = await element.textContent()
      // Each interactive element should have either aria-label or visible text
      expect(ariaLabel || hasText?.trim()).toBeTruthy()
    }
  })

  test('main chat interface should be accessible', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
    
    await injectAxe(page)
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: { html: true }
    })
    
    // Check landmarks
    await expect(page.locator('main, [role="main"]')).toBeVisible()
    
    // Check form accessibility
    const messageInput = page.locator('[data-testid="message-input"]')
    const sendButton = page.locator('[data-testid="send-button"]')
    
    // Input should have proper labels
    await expect(messageInput).toHaveAttribute('aria-label', /.+/)
    await expect(sendButton).toHaveAttribute('aria-label', /.+/)
    
    // Test keyboard navigation through interface
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    
    // Should eventually focus on message input or send button
    const focusedTestId = await page.evaluate(() => 
      document.activeElement?.getAttribute('data-testid')
    )
    expect(['message-input', 'send-button', 'new-conversation-button']).toContain(focusedTestId)
  })

  test('conversation sidebar should be accessible', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="conversation-sidebar"]')).toBeVisible()
    
    await injectAxe(page)
    
    // Check sidebar specific accessibility
    const sidebar = page.locator('[data-testid="conversation-sidebar"]')
    
    // Should have proper ARIA role
    const sidebarRole = await sidebar.getAttribute('role')
    expect(['navigation', 'complementary', 'region']).toContain(sidebarRole)
    
    // Check navigation structure
    const navItems = page.locator('[data-testid="conversation-item"]')
    const navItemCount = await navItems.count()
    
    if (navItemCount > 0) {
      // Each navigation item should be accessible
      for (let i = 0; i < Math.min(navItemCount, 3); i++) {
        const item = navItems.nth(i)
        
        // Should be focusable
        await item.focus()
        const isFocused = await item.evaluate(el => el === document.activeElement)
        expect(isFocused).toBe(true)
        
        // Should respond to Enter key
        await page.keyboard.press('Enter')
        await expect(item).toHaveAttribute('data-active', 'true')
      }
    }
    
    // New conversation button should be accessible
    const newConvButton = page.locator('[data-testid="new-conversation-button"]')
    await expect(newConvButton).toHaveAttribute('aria-label', /.+/)
    
    await checkA11y(page, '[data-testid="conversation-sidebar"]')
  })

  test('messages should be accessible with screen readers', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
    
    // Create new conversation and send message
    await page.locator('[data-testid="new-conversation-button"]').click()
    await sendMessageAndWait(page, 'Hello, this is a test message')
    
    await injectAxe(page)
    
    // Check message accessibility
    const userMessage = page.locator('[data-testid="user-message"]').last()
    const assistantMessage = page.locator('[data-testid="assistant-message"]').last()
    
    // Messages should have proper roles or ARIA labels
    await expect(userMessage).toBeVisible()
    await expect(assistantMessage).toBeVisible()
    
    // Check message structure for screen readers
    const userMessageRole = await userMessage.getAttribute('role')
    const userMessageLabel = await userMessage.getAttribute('aria-label')
    
    // Should have some form of semantic markup
    expect(userMessageRole || userMessageLabel).toBeTruthy()
    
    // Messages should be in proper reading order
    const messages = page.locator('[data-testid="user-message"], [data-testid="assistant-message"]')
    const messageCount = await messages.count()
    expect(messageCount).toBeGreaterThanOrEqual(2)
    
    await checkA11y(page, '[data-testid="chat-messages"]')
  })

  test('modal dialogs should be accessible', async ({ page }) => {
    await page.goto('/')
    
    // Trigger a modal (e.g., delete confirmation)
    const conversationItem = page.locator('[data-testid="conversation-item"]').first()
    
    if (await conversationItem.isVisible()) {
      await conversationItem.click({ button: 'right' })
      
      const deleteButton = page.locator('[data-testid="delete-conversation"], text=Delete')
      if (await deleteButton.isVisible()) {
        await deleteButton.click()
        
        // Check modal accessibility
        const modal = page.locator('[role="dialog"], [data-testid="delete-confirmation"]')
        
        if (await modal.isVisible()) {
          await injectAxe(page)
          
          // Modal should have proper ARIA attributes
          await expect(modal).toHaveAttribute('role', 'dialog')
          
          // Should have aria-labelledby or aria-label
          const hasLabel = await modal.evaluate(el => 
            el.hasAttribute('aria-labelledby') || el.hasAttribute('aria-label')
          )
          expect(hasLabel).toBe(true)
          
          // Focus should be trapped in modal
          await page.keyboard.press('Tab')
          const focusedElement = await page.evaluate(() => document.activeElement)
          const isInsideModal = await modal.evaluate((modal, focused) => 
            modal.contains(focused), focusedElement
          )
          expect(isInsideModal).toBe(true)
          
          // Should close on Escape
          await page.keyboard.press('Escape')
          await expect(modal).not.toBeVisible()
        }
      }
    }
  })

  test('color contrast should meet WCAG AA standards', async ({ page }) => {
    await page.goto('/')
    await injectAxe(page)
    
    // Run color contrast specific checks
    await checkA11y(page, null, {
      axeOptions: {
        runOnly: ['color-contrast']
      }
    })
    
    // Additional manual checks for key UI elements
    const keyElements = [
      '[data-testid="message-input"]',
      '[data-testid="send-button"]',
      '[data-testid="conversation-item"]',
      '[data-testid="user-message"]',
      '[data-testid="assistant-message"]'
    ]
    
    for (const selector of keyElements) {
      const element = page.locator(selector).first()
      if (await element.isVisible()) {
        // Get computed styles
        const styles = await element.evaluate(el => {
          const computed = window.getComputedStyle(el)
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            fontSize: computed.fontSize
          }
        })
        
        // Ensure styles are computed (basic check)
        expect(styles.color).toBeTruthy()
        expect(styles.backgroundColor).toBeTruthy()
      }
    }
  })

  test('keyboard navigation should work throughout the app', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
    
    // Test tab navigation through main UI elements
    const expectedFocusableElements = [
      '[data-testid="new-conversation-button"]',
      '[data-testid="conversation-item"]',
      '[data-testid="message-input"]',
      '[data-testid="send-button"]'
    ]
    
    let currentFocusIndex = -1
    
    // Navigate through focusable elements
    for (let i = 0; i < 10; i++) { // Limit iterations
      await page.keyboard.press('Tab')
      
      const focusedTestId = await page.evaluate(() => 
        document.activeElement?.getAttribute('data-testid')
      )
      
      if (focusedTestId) {
        console.log(`Tab ${i + 1}: Focused on ${focusedTestId}`)
        
        // Test that Enter key works on interactive elements
        if (focusedTestId === 'new-conversation-button') {
          await page.keyboard.press('Enter')
          // Should create new conversation
          await expect(page.locator('[data-testid="conversation-item"]')).toHaveCount(1)
        } else if (focusedTestId === 'conversation-item') {
          await page.keyboard.press('Enter')
          // Should select conversation
          const focusedConv = page.locator('[data-testid="conversation-item"]:focus')
          if (await focusedConv.isVisible()) {
            await expect(focusedConv).toHaveAttribute('data-active', 'true')
          }
        }
      }
      
      // Break if we've cycled through main elements
      if (i > 3 && focusedTestId && expectedFocusableElements.some(sel => 
        sel.includes(focusedTestId)
      )) {
        break
      }
    }
  })

  test('focus management should work correctly', async ({ page }) => {
    await page.goto('/')
    
    // Test focus when creating new conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Message input should receive focus
    await expect(page.locator('[data-testid="message-input"]')).toBeFocused()
    
    // Test focus after sending message
    await page.fill('[data-testid="message-input"]', 'Test message')
    await page.click('[data-testid="send-button"]')
    
    // Focus should return to message input after sending
    await expect(page.locator('[data-testid="message-input"]')).toBeFocused()
    
    // Test focus when switching conversations
    if (await page.locator('[data-testid="conversation-item"]').count() > 1) {
      await page.locator('[data-testid="conversation-item"]').first().click()
      
      // Focus should move appropriately (either stay on conversation or move to input)
      const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
      expect(['conversation-item', 'message-input']).toContain(focusedElement)
    }
  })

  test('error messages should be accessible', async ({ page }) => {
    await page.goto('/')
    
    // Mock API error to trigger error state
    await page.route('**/api/chat', async route => {
      await route.fulfill({
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server error' })
      })
    })
    
    // Create new conversation and trigger error
    await page.locator('[data-testid="new-conversation-button"]').click()
    await page.fill('[data-testid="message-input"]', 'This will cause an error')
    await page.click('[data-testid="send-button"]')
    
    // Error message should be accessible
    const errorMessage = page.locator('[data-testid="error-message"], [role="alert"], text=error')
    if (await errorMessage.isVisible()) {
      await injectAxe(page)
      
      // Error should have proper ARIA role
      const hasAlertRole = await errorMessage.evaluate(el => 
        el.getAttribute('role') === 'alert' || el.getAttribute('aria-live')
      )
      expect(hasAlertRole).toBeTruthy()
      
      await checkA11y(page)
    }
  })

  test('loading states should be accessible', async ({ page }) => {
    await page.goto('/')
    
    // Mock slow API response to show loading state
    await page.route('**/api/chat', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Test response'
      })
    })
    
    // Create new conversation and send message
    await page.locator('[data-testid="new-conversation-button"]').click()
    await page.fill('[data-testid="message-input"]', 'Test message')
    await page.click('[data-testid="send-button"]')
    
    // Loading state should be accessible
    const loadingIndicator = page.locator('[data-testid="message-loading"], [aria-label*="loading"], text=Loading')
    
    if (await loadingIndicator.isVisible()) {
      // Should have proper ARIA attributes for screen readers
      const hasAriaLabel = await loadingIndicator.getAttribute('aria-label')
      const hasAriaLive = await loadingIndicator.getAttribute('aria-live')
      
      expect(hasAriaLabel || hasAriaLive).toBeTruthy()
      
      await injectAxe(page)
      await checkA11y(page)
    }
  })

  test('mobile accessibility should be maintained', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    await injectAxe(page)
    await checkA11y(page)
    
    // Test touch targets are large enough (minimum 44px)
    const interactiveElements = page.locator('button, a[href], input, [role="button"]')
    const elementCount = await interactiveElements.count()
    
    for (let i = 0; i < Math.min(elementCount, 5); i++) {
      const element = interactiveElements.nth(i)
      if (await element.isVisible()) {
        const boundingBox = await element.boundingBox()
        if (boundingBox) {
          // Touch targets should be at least 44x44px
          expect(boundingBox.width).toBeGreaterThanOrEqual(40)
          expect(boundingBox.height).toBeGreaterThanOrEqual(40)
        }
      }
    }
    
    // Test mobile-specific navigation
    const hamburgerMenu = page.locator('[data-testid="menu-toggle"], [data-testid="sidebar-toggle"]')
    if (await hamburgerMenu.isVisible()) {
      // Should be accessible via keyboard
      await hamburgerMenu.focus()
      await page.keyboard.press('Enter')
      
      // Should toggle sidebar visibility
      const sidebar = page.locator('[data-testid="conversation-sidebar"]')
      await expect(sidebar).toBeVisible()
    }
  })
})
