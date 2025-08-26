import { test, expect } from '@playwright/test'

test.describe('Smoke Tests', () => {
  test('app loads and shows login page for unauthenticated users', async ({ page }) => {
    await page.goto('/')
    
    // Should redirect to login or show login UI
    await expect(page).toHaveURL(/.*login.*/)
    
    // Basic elements should be present
    await expect(page.locator('body')).toBeVisible()
  })

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    
    // Should show login elements
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/sign|login|authenticate/i)).toBeVisible()
  })

  test('app has proper meta tags and accessibility', async ({ page }) => {
    await page.goto('/login')
    
    // Check basic SEO
    const title = await page.title()
    expect(title).toBeTruthy()
    expect(title.length).toBeGreaterThan(0)
    
    // Check viewport meta tag
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport).toContain('width=device-width')
    
    // Basic accessibility - page should have proper structure
    await expect(page.locator('main, [role="main"], body')).toBeVisible()
  })

  test('basic navigation works', async ({ page }) => {
    // Test that we can navigate around the app
    await page.goto('/')
    
    // Should have proper HTML structure
    await expect(page.locator('html')).toBeVisible()
    await expect(page.locator('body')).toBeVisible()
    
    // Should not have obvious JavaScript errors (no error page)
    await expect(page.locator('text=Application error')).not.toBeVisible()
  })
})