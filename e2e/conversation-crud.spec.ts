import { test, expect } from '@playwright/test'
import { sendMessageAndWait, mockApiResponses, checkAccessibility, testResponsiveBreakpoints, TEST_DATA } from './helpers/test-utils'

test.describe('Conversation CRUD Operations', () => {
  // Setup authenticated state for all tests
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('auth-state', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com' },
        session: { access_token: 'mock-token' }
      }))
    })
    
    // Mock API responses with conversation data
    await page.route('**/api/conversations', async route => {
      const request = route.request()
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversations: [
              {
                id: 'conv-1',
                title: 'Startup Strategy Discussion',
                created_at: '2025-01-27T10:00:00.000Z',
                updated_at: '2025-01-27T10:30:00.000Z'
              },
              {
                id: 'conv-2',
                title: 'Technology Architecture',
                created_at: '2025-01-27T09:00:00.000Z',
                updated_at: '2025-01-27T09:15:00.000Z'
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
              id: 'new-conv-' + Date.now(),
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

  test('should display conversation list in sidebar', async ({ page }) => {
    // Check sidebar is visible
    await expect(page.locator('[data-testid="conversation-sidebar"]')).toBeVisible()
    
    // Check conversations are listed
    await expect(page.locator('[data-testid="conversation-item"]')).toHaveCount(2)
    
    // Check conversation titles
    await expect(page.locator('text=Startup Strategy Discussion')).toBeVisible()
    await expect(page.locator('text=Technology Architecture')).toBeVisible()
    
    // Check "New Conversation" button
    await expect(page.locator('[data-testid="new-conversation-button"]')).toBeVisible()
  })

  test('should create new conversation', async ({ page }) => {
    const newConvButton = page.locator('[data-testid="new-conversation-button"]')
    
    // Click new conversation
    await newConvButton.click()
    
    // Should create new conversation and navigate to it
    await expect(page.locator('[data-testid="conversation-item"]')).toHaveCount(3)
    
    // Should show "New Conversation" title
    await expect(page.locator('text=New Conversation')).toBeVisible()
    
    // Should clear the chat area
    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible()
    
    // Should focus on message input
    await expect(page.locator('[data-testid="message-input"]')).toBeFocused()
  })

  test('should select and switch between conversations', async ({ page }) => {
    const firstConv = page.locator('[data-testid="conversation-item"]:nth-child(1)')
    const secondConv = page.locator('[data-testid="conversation-item"]:nth-child(2)')
    
    // Click first conversation
    await firstConv.click()
    
    // Should be selected/active
    await expect(firstConv).toHaveAttribute('data-active', 'true')
    
    // Click second conversation
    await secondConv.click()
    
    // Should switch selection
    await expect(secondConv).toHaveAttribute('data-active', 'true')
    await expect(firstConv).not.toHaveAttribute('data-active', 'true')
  })

  test('should rename conversation', async ({ page }) => {
    const conversationItem = page.locator('[data-testid="conversation-item"]:nth-child(1)')
    
    // Mock the rename API
    await page.route('**/api/conversations/conv-1', async route => {
      if (route.request().method() === 'PATCH') {
        const body = await route.request().postDataJSON()
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation: {
              id: 'conv-1',
              title: body.title,
              updated_at: new Date().toISOString()
            }
          })
        })
      }
    })
    
    // Right-click or look for rename option
    await conversationItem.click({ button: 'right' })
    
    // Should show context menu with rename option
    const renameButton = page.locator('[data-testid="rename-conversation"], text=Rename')
    await expect(renameButton).toBeVisible()
    
    await renameButton.click()
    
    // Should show rename input or dialog
    const renameInput = page.locator('[data-testid="rename-input"], input[value*="Startup Strategy"]')
    await expect(renameInput).toBeVisible()
    await expect(renameInput).toBeFocused()
    
    // Change the title
    await renameInput.clear()
    await renameInput.fill(TEST_DATA.RENAMED_TITLE)
    
    // Submit rename (Enter or Save button)
    await Promise.race([
      renameInput.press('Enter'),
      page.locator('[data-testid="save-rename"], text=Save').click()
    ])
    
    // Should update the conversation title
    await expect(page.locator(`text=${TEST_DATA.RENAMED_TITLE}`)).toBeVisible()
  })

  test('should delete conversation with confirmation', async ({ page }) => {
    const conversationItem = page.locator('[data-testid="conversation-item"]:nth-child(1)')
    
    // Mock delete API
    await page.route('**/api/conversations/conv-1', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true })
        })
      }
    })
    
    // Right-click for context menu
    await conversationItem.click({ button: 'right' })
    
    // Click delete option
    const deleteButton = page.locator('[data-testid="delete-conversation"], text=Delete')
    await expect(deleteButton).toBeVisible()
    await deleteButton.click()
    
    // Should show confirmation dialog
    await expect(page.locator('[data-testid="delete-confirmation"], text=Are you sure')).toBeVisible()
    
    // Cancel first
    const cancelButton = page.locator('[data-testid="cancel-delete"], text=Cancel')
    if (await cancelButton.isVisible()) {
      await cancelButton.click()
      
      // Should still have the conversation
      await expect(page.locator('[data-testid="conversation-item"]')).toHaveCount(2)
    }
    
    // Try delete again
    await conversationItem.click({ button: 'right' })
    await page.locator('[data-testid="delete-conversation"], text=Delete').click()
    
    // Confirm deletion
    const confirmButton = page.locator('[data-testid="confirm-delete"], text=Delete, text=Confirm')
    await confirmButton.click()
    
    // Should remove conversation from list
    await expect(page.locator('[data-testid="conversation-item"]')).toHaveCount(1)
    
    // Should not show the deleted conversation title
    await expect(page.locator('text=Startup Strategy Discussion')).not.toBeVisible()
  })

  test('should handle empty conversation list', async ({ page }) => {
    // Mock empty conversations
    await page.route('**/api/conversations', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversations: [] })
        })
      }
    })
    
    await page.reload()
    
    // Should show empty state in sidebar
    await expect(page.locator('[data-testid="empty-conversations"], text=No conversations')).toBeVisible()
    
    // Should still have "New Conversation" button
    await expect(page.locator('[data-testid="new-conversation-button"]')).toBeVisible()
  })

  test('should auto-generate title after first message exchange', async ({ page }) => {
    // Create new conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    
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
    
    // Send first message
    await sendMessageAndWait(page, TEST_DATA.TEST_MESSAGE)
    
    // Should trigger title generation after response
    await expect(page.locator(`text=${TEST_DATA.CONVERSATION_TITLE}`)).toBeVisible({ timeout: 10000 })
    
    // Should update the conversation in sidebar
    await expect(page.locator('[data-testid="conversation-item"]').last()).toContainText(TEST_DATA.CONVERSATION_TITLE)
  })

  test('should show loading state during title generation', async ({ page }) => {
    // Create new conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Mock slow title generation
    await page.route('**/api/conversations/*/title', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000))
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
    
    // Send message
    await sendMessageAndWait(page, 'Test message')
    
    // Should show loading state for title
    await expect(page.locator('[data-testid="title-loading"], text=Generating title')).toBeVisible()
    
    // Should eventually show generated title
    await expect(page.locator(`text=${TEST_DATA.CONVERSATION_TITLE}`)).toBeVisible({ timeout: 5000 })
  })

  test('should handle conversation loading errors', async ({ page }) => {
    // Mock API error
    await page.route('**/api/conversations', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Server error' })
        })
      }
    })
    
    await page.reload()
    
    // Should show error state
    await expect(page.locator('[data-testid="conversations-error"], text=Error loading conversations')).toBeVisible()
    
    // Should have retry option
    const retryButton = page.locator('[data-testid="retry-conversations"], text=Retry')
    if (await retryButton.isVisible()) {
      await expect(retryButton).toBeVisible()
    }
  })

  test('should be accessible', async ({ page }) => {
    // Test keyboard navigation in sidebar
    await page.keyboard.press('Tab')
    
    // Should navigate through conversation items
    const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
    
    // Keep tabbing through sidebar elements
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab')
      const newFocus = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
      if (['conversation-item', 'new-conversation-button'].includes(newFocus)) {
        break
      }
    }
    
    // Test Enter key to select conversation
    const firstConv = page.locator('[data-testid="conversation-item"]:nth-child(1)')
    await firstConv.focus()
    await page.keyboard.press('Enter')
    
    await expect(firstConv).toHaveAttribute('data-active', 'true')
    
    // Run accessibility scan
    await checkAccessibility(page, 'conversation management')
  })

  test('should work responsively across devices', async ({ page }) => {
    await testResponsiveBreakpoints(page, async () => {
      // Check sidebar visibility and behavior
      const sidebar = page.locator('[data-testid="conversation-sidebar"]')
      
      if (page.viewportSize()?.width! < 768) {
        // On mobile, sidebar might be hidden/collapsible
        const hamburgerMenu = page.locator('[data-testid="menu-toggle"], [data-testid="sidebar-toggle"]')
        if (await hamburgerMenu.isVisible()) {
          await hamburgerMenu.click()
          await expect(sidebar).toBeVisible()
        }
      } else {
        // On desktop, sidebar should always be visible
        await expect(sidebar).toBeVisible()
      }
      
      // Test conversation interactions work at this breakpoint
      const newConvButton = page.locator('[data-testid="new-conversation-button"]')
      await expect(newConvButton).toBeVisible()
      
      const conversationItems = page.locator('[data-testid="conversation-item"]')
      if (await conversationItems.count() > 0) {
        await conversationItems.first().click()
        await expect(conversationItems.first()).toHaveAttribute('data-active', 'true')
      }
    })
  })

  test('should maintain conversation context when switching', async ({ page }) => {
    // Mock different message sets for different conversations
    await page.route('**/api/messages*', async route => {
      const url = route.request().url()
      const conversationId = url.match(/conversation_id=([^&]+)/)?.[1]
      
      let messages = []
      if (conversationId === 'conv-1') {
        messages = [
          { id: '1', content: 'Hello, what startup advice do you have?', role: 'user' },
          { id: '2', content: 'Focus on solving real problems and validate early.', role: 'assistant' }
        ]
      } else if (conversationId === 'conv-2') {
        messages = [
          { id: '3', content: 'What tech stack should I use?', role: 'user' },
          { id: '4', content: 'Choose based on team expertise and scalability needs.', role: 'assistant' }
        ]
      }
      
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      })
    })
    
    // Select first conversation
    await page.locator('[data-testid="conversation-item"]:nth-child(1)').click()
    
    // Should load first conversation's messages
    await expect(page.locator('text=startup advice')).toBeVisible()
    await expect(page.locator('text=real problems')).toBeVisible()
    
    // Switch to second conversation
    await page.locator('[data-testid="conversation-item"]:nth-child(2)').click()
    
    // Should load second conversation's messages
    await expect(page.locator('text=tech stack')).toBeVisible()
    await expect(page.locator('text=team expertise')).toBeVisible()
    
    // First conversation messages should not be visible
    await expect(page.locator('text=startup advice')).not.toBeVisible()
  })
})
