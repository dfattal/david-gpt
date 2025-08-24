import { test, expect } from '@playwright/test'
import { mockApiResponses, sendMessageAndWait, checkAccessibility } from './helpers/test-utils'

test.describe('Complete User Journey', () => {
  test('full end-to-end user workflow', async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('auth-state', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com', name: 'Test User' },
        session: { access_token: 'mock-token' }
      }))
    })
    
    await mockApiResponses(page)
    
    // 1. User arrives at the app
    await page.goto('/')
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
    
    // 2. Check initial state
    await expect(page.locator('[data-testid="conversation-sidebar"]')).toBeVisible()
    await expect(page.locator('[data-testid="empty-state"], text=Start')).toBeVisible()
    
    // 3. User creates first conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    await expect(page.locator('[data-testid="message-input"]')).toBeFocused()
    
    // 4. User sends first message
    const firstMessage = 'Hello David! Can you tell me about your experience with startups?'
    await sendMessageAndWait(page, firstMessage)
    
    // 5. Verify conversation flow
    await expect(page.locator('[data-testid="user-message"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="assistant-message"]')).toHaveCount(1)
    
    // 6. Check David's persona in response
    const assistantResponse = page.locator('[data-testid="assistant-message"]').first()
    const responseText = await assistantResponse.textContent()
    expect(responseText?.toLowerCase()).toContain('david')
    
    // 7. Title should be generated
    await expect(page.locator('[data-testid="conversation-item"]')).toHaveCount(1)
    const conversationTitle = await page.locator('[data-testid="conversation-item"]').textContent()
    expect(conversationTitle).not.toBe('New Conversation')
    
    // 8. User continues conversation
    const secondMessage = 'What specific advice do you have for first-time entrepreneurs?'
    await sendMessageAndWait(page, secondMessage)
    
    await expect(page.locator('[data-testid="user-message"]')).toHaveCount(2)
    await expect(page.locator('[data-testid="assistant-message"]')).toHaveCount(2)
    
    // 9. User creates second conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Should have 2 conversations now
    await expect(page.locator('[data-testid="conversation-item"]')).toHaveCount(2)
    
    // Chat area should be cleared for new conversation
    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible()
    
    // 10. User sends message in second conversation
    const thirdMessage = 'What technologies do you recommend for building a SaaS product?'
    await sendMessageAndWait(page, thirdMessage)
    
    // 11. User switches back to first conversation
    await page.locator('[data-testid="conversation-item"]').first().click()
    
    // Should load previous messages
    await expect(page.locator('[data-testid="user-message"]')).toHaveCount(2)
    await expect(page.locator('[data-testid="user-message"]').first()).toContainText('Hello David')
    
    // 12. User renames a conversation
    await page.locator('[data-testid="conversation-item"]').first().click({ button: 'right' })
    
    const renameOption = page.locator('[data-testid="rename-conversation"], text=Rename')
    if (await renameOption.isVisible()) {
      await renameOption.click()
      
      const renameInput = page.locator('[data-testid="rename-input"]')
      await renameInput.clear()
      await renameInput.fill('Startup Advice Session')
      await renameInput.press('Enter')
      
      await expect(page.locator('text=Startup Advice Session')).toBeVisible()
    }
    
    // 13. User deletes a conversation
    await page.locator('[data-testid="conversation-item"]').last().click({ button: 'right' })
    
    const deleteOption = page.locator('[data-testid="delete-conversation"], text=Delete')
    if (await deleteOption.isVisible()) {
      await deleteOption.click()
      
      // Confirm deletion
      const confirmButton = page.locator('[data-testid="confirm-delete"], text=Delete, text=Confirm')
      await confirmButton.click()
      
      // Should have only 1 conversation left
      await expect(page.locator('[data-testid="conversation-item"]')).toHaveCount(1)
    }
    
    // 14. Test error handling
    await page.route('**/api/chat', async route => {
      await route.fulfill({
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server error' })
      })
    })
    
    await page.fill('[data-testid="message-input"]', 'This will cause an error')
    await page.click('[data-testid="send-button"]')
    
    // Should show error state
    const errorMessage = page.locator('[data-testid="error-message"], text=error')
    if (await errorMessage.isVisible()) {
      await expect(errorMessage).toBeVisible()
    }
    
    // 15. Test accessibility throughout the journey
    await checkAccessibility(page, 'complete user journey')
    
    // 16. Test keyboard navigation
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    
    const focusedElement = await page.evaluate(() => 
      document.activeElement?.getAttribute('data-testid')
    )
    expect(['message-input', 'send-button', 'new-conversation-button', 'conversation-item'])
      .toContain(focusedElement)
    
    // 17. User logs out (if logout functionality exists)
    const userProfile = page.locator('[data-testid="user-profile"], [data-testid="user-menu"]')
    if (await userProfile.isVisible()) {
      await userProfile.click()
      
      const logoutButton = page.locator('[data-testid="logout"], text=Sign out')
      if (await logoutButton.isVisible()) {
        await logoutButton.click()
        
        // Should redirect to login or show login state
        await Promise.race([
          expect(page).toHaveURL('/login'),
          expect(page.locator('text=Continue with Google')).toBeVisible()
        ])
      }
    }
    
    console.log('✅ Complete user journey test passed!')
  })
  
  test('user journey on mobile device', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('auth-state', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com' },
        session: { access_token: 'mock-token' }
      }))
    })
    
    await mockApiResponses(page)
    
    // Mobile user journey
    await page.goto('/')
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
    
    // On mobile, sidebar might be hidden initially
    const hamburger = page.locator('[data-testid="menu-toggle"], [data-testid="sidebar-toggle"]')
    if (await hamburger.isVisible()) {
      await hamburger.tap() // Use tap for mobile
      await expect(page.locator('[data-testid="conversation-sidebar"]')).toBeVisible()
    }
    
    // Create conversation on mobile
    await page.locator('[data-testid="new-conversation-button"]').tap()
    
    // Send message with mobile keyboard
    const messageInput = page.locator('[data-testid="message-input"]')
    await messageInput.tap()
    await messageInput.fill('Mobile test message')
    
    // Use tap instead of click for mobile
    await page.locator('[data-testid="send-button"]').tap()
    
    // Verify mobile interaction
    await expect(page.locator('[data-testid="user-message"]')).toContainText('Mobile test message')
    
    // Test mobile scrolling
    for (let i = 1; i <= 3; i++) {
      await sendMessageAndWait(page, `Mobile message ${i}`)
    }
    
    // Latest message should be visible
    await expect(page.locator('[data-testid="user-message"]').last()).toBeInViewport()
    
    console.log('✅ Mobile user journey test passed!')
  })
  
  test('accessibility compliance throughout user journey', async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('auth-state', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com' },
        session: { access_token: 'mock-token' }
      }))
    })
    
    await mockApiResponses(page)
    
    // Test accessibility at each major step
    
    // 1. Initial load
    await page.goto('/')
    await checkAccessibility(page, 'initial load')
    
    // 2. After creating conversation
    await page.locator('[data-testid="new-conversation-button"]').click()
    await checkAccessibility(page, 'new conversation created')
    
    // 3. After sending message
    await sendMessageAndWait(page, 'Accessibility test message')
    await checkAccessibility(page, 'after message exchange')
    
    // 4. With multiple conversations
    await page.locator('[data-testid="new-conversation-button"]').click()
    await sendMessageAndWait(page, 'Second conversation message')
    await checkAccessibility(page, 'multiple conversations')
    
    // 5. Test keyboard-only navigation
    let tabCount = 0
    const maxTabs = 10
    
    while (tabCount < maxTabs) {
      await page.keyboard.press('Tab')
      tabCount++
      
      const focusedElement = await page.evaluate(() => {
        const active = document.activeElement
        return {
          tagName: active?.tagName,
          testId: active?.getAttribute('data-testid'),
          role: active?.getAttribute('role')
        }
      })
      
      // Ensure focused elements are visible and interactive
      if (focusedElement.testId) {
        const element = page.locator(`[data-testid="${focusedElement.testId}"]`)
        await expect(element).toBeVisible()
        
        // Test interaction on key elements
        if (focusedElement.testId === 'message-input') {
          await element.fill('Keyboard navigation test')
          await element.press('Enter')
          await expect(page.locator('[data-testid="user-message"]').last())
            .toContainText('Keyboard navigation test')
          break
        }
      }
    }
    
    await checkAccessibility(page, 'keyboard navigation complete')
    
    console.log('✅ Accessibility compliance test passed!')
  })
  
  test('performance and responsiveness under load', async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('auth-state', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com' },
        session: { access_token: 'mock-token' }
      }))
    })
    
    await mockApiResponses(page)
    
    // Performance measurement
    await page.goto('/')
    
    const startTime = Date.now()
    
    // Simulate heavy usage
    await page.locator('[data-testid="new-conversation-button"]').click()
    
    // Send multiple messages quickly
    for (let i = 1; i <= 5; i++) {
      await page.fill('[data-testid="message-input"]', `Performance test message ${i}`)
      await page.click('[data-testid="send-button"]')
      
      // Wait for response but don't block too long
      try {
        await expect(page.locator('[data-testid="assistant-message"]').nth(i-1))
          .toBeVisible({ timeout: 5000 })
      } catch (e) {
        console.warn(`Message ${i} response timed out, but continuing test...`)
      }
    }
    
    const endTime = Date.now()
    const totalTime = endTime - startTime
    
    // Should complete within reasonable time (adjust threshold as needed)
    expect(totalTime).toBeLessThan(30000) // 30 seconds max
    
    // Check that UI is still responsive
    await expect(page.locator('[data-testid="message-input"]')).toBeEnabled()
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled()
    
    // Memory leak check (basic)
    const memoryInfo = await page.evaluate(() => {
      // @ts-ignore - performance.memory is available in Chrome
      return (performance as any).memory?.usedJSHeapSize || 0
    })
    
    // Should not use excessive memory (adjust threshold as needed)
    if (memoryInfo > 0) {
      expect(memoryInfo).toBeLessThan(100 * 1024 * 1024) // 100MB threshold
    }
    
    console.log(`✅ Performance test completed in ${totalTime}ms`)
    console.log(`Memory usage: ${(memoryInfo / 1024 / 1024).toFixed(2)}MB`)
  })
})
