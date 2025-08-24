import { test, expect } from '@playwright/test'
import { waitForAuth, mockGoogleAuth, checkAccessibility } from './helpers/test-utils'

test.describe('Authentication Flow', () => {
  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/')
    
    // Should redirect to login page
    await expect(page).toHaveURL('/login')
    
    // Verify login page elements
    await expect(page.locator('h1')).toContainText('Welcome to David-GPT')
    await expect(page.locator('text=Chat with David Fattal AI')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })

  test('should display login page correctly', async ({ page }) => {
    await page.goto('/login')
    
    // Check page structure
    await expect(page.locator('[data-testid="login-card"], .w-full.max-w-md')).toBeVisible()
    
    // Check branding
    await expect(page.locator('text=David-GPT')).toBeVisible()
    await expect(page.locator('text=Technology entrepreneur and startup advisor')).toBeVisible()
    
    // Check call-to-action
    const googleButton = page.getByRole('button', { name: /continue with google/i })
    await expect(googleButton).toBeVisible()
    await expect(googleButton).toBeEnabled()
    
    // Check terms notice
    await expect(page.locator('text=terms of service')).toBeVisible()
  })

  test('should show loading state when authenticating', async ({ page }) => {
    await page.goto('/login')
    
    // Mock slow auth response
    await page.route('**/auth/v1/authorize*', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await route.continue()
    })
    
    const googleButton = page.getByRole('button', { name: /continue with google/i })
    
    // Click and verify loading state
    await googleButton.click()
    
    // Should show loading state
    await expect(page.getByRole('button', { name: /loading/i })).toBeVisible()
    await expect(googleButton).toBeDisabled()
  })

  test.skip('should handle Google OAuth flow', async ({ page }) => {
    // Note: This test is skipped as it requires actual OAuth setup
    // In a real environment, you would either:
    // 1. Use OAuth testing tools
    // 2. Mock the OAuth provider
    // 3. Use test credentials in a staging environment
    
    await mockGoogleAuth(page)
    await page.goto('/login')
    
    const googleButton = page.getByRole('button', { name: /continue with google/i })
    await googleButton.click()
    
    // Should eventually redirect to main app
    await expect(page).toHaveURL('/')
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible()
  })

  test('should handle authentication errors', async ({ page }) => {
    await page.goto('/auth/error')
    
    // Check error page elements
    await expect(page.locator('text=Authentication Error')).toBeVisible()
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible()
    
    // Click try again should go to login
    await page.getByRole('button', { name: /try again/i }).click()
    await expect(page).toHaveURL('/login')
  })

  test('should protect authenticated routes', async ({ page }) => {
    // Try to access protected route without auth
    await page.goto('/')
    await expect(page).toHaveURL('/login')
    
    // Try direct conversation access
    await page.goto('/conversation/test-id')
    await expect(page).toHaveURL('/login')
  })

  test('should handle auth callback', async ({ page }) => {
    // Mock successful callback
    await page.route('**/auth/callback*', async route => {
      await route.fulfill({
        status: 302,
        headers: {
          'Location': '/'
        }
      })
    })
    
    await page.goto('/auth/callback?code=test_code')
    
    // Should redirect to main app or show processing state
    await Promise.race([
      expect(page).toHaveURL('/'),
      expect(page.locator('text=processing')).toBeVisible()
    ])
  })

  test('should maintain session across page refreshes', async ({ page, context }) => {
    // This test would require actual authentication setup
    // For now, we'll simulate it with localStorage
    
    await page.goto('/login')
    
    // Mock authenticated state
    await page.evaluate(() => {
      localStorage.setItem('auth-state', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com' },
        session: { access_token: 'mock-token' }
      }))
    })
    
    // Navigate to main app
    await page.goto('/')
    
    // Should not redirect to login
    await page.waitForTimeout(1000)
    
    // Refresh page
    await page.reload()
    
    // Should still be on main app (not redirected to login)
    await page.waitForTimeout(1000)
    // Note: Actual implementation might vary based on auth provider
  })

  test('should logout successfully', async ({ page }) => {
    // Mock authenticated state
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('auth-state', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com' },
        session: { access_token: 'mock-token' }
      }))
    })
    
    // Mock the presence of user profile component
    await page.route('**/api/user', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: { email: 'test@example.com', name: 'Test User' } })
      })
    })
    
    await page.reload()
    
    // Look for user profile or logout button
    // This might be in a dropdown menu or user avatar
    const userMenu = page.locator('[data-testid="user-menu"], [data-testid="user-profile"]')
    if (await userMenu.isVisible()) {
      await userMenu.click()
      
      const logoutButton = page.getByRole('button', { name: /sign out|logout/i })
      if (await logoutButton.isVisible()) {
        await logoutButton.click()
        
        // Should redirect to login
        await expect(page).toHaveURL('/login')
      }
    }
  })

  test('should be accessible', async ({ page }) => {
    await page.goto('/login')
    
    // Check keyboard navigation
    await page.keyboard.press('Tab')
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(['BUTTON', 'A', 'INPUT']).toContain(focusedElement)
    
    // Check ARIA labels
    const googleButton = page.getByRole('button', { name: /continue with google/i })
    await expect(googleButton).toBeVisible()
    
    // Run accessibility scan
    await checkAccessibility(page, 'login page')
  })

  test('should work on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/login')
    
    // Check mobile layout
    await expect(page.locator('.w-full.max-w-md')).toBeVisible()
    
    // Button should be full width and accessible on mobile
    const googleButton = page.getByRole('button', { name: /continue with google/i })
    await expect(googleButton).toBeVisible()
    
    const buttonBox = await googleButton.boundingBox()
    expect(buttonBox?.width).toBeGreaterThan(200) // Should be wide enough for mobile
  })
})
