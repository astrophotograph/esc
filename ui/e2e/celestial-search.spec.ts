import { test, expect } from '@playwright/test'
import { TelescopeTestHelpers, MockWebSocketHelpers } from './test-utils'

test.describe('Celestial Search Dialog', () => {
  let testHelpers: TelescopeTestHelpers
  let mockWS: MockWebSocketHelpers

  test.beforeEach(async ({ page }) => {
    testHelpers = new TelescopeTestHelpers(page)
    mockWS = new MockWebSocketHelpers(page)
    
    // Mock WebSocket connection before navigation
    await mockWS.mockWebSocketConnection()
    
    // Navigate to the application
    await page.goto('/')
    await testHelpers.waitForAppReady()
  })

  test('should open celestial search dialog with Search button', async ({ page }) => {
    await testHelpers.openCelestialSearchDialog()
    
    // Verify dialog is open and contains expected elements
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(page.locator('[placeholder*="Search celestial objects"]')).toBeVisible()
    await testHelpers.verifyKeyboardShortcutHint()
  })

  test('should open celestial search dialog with Cmd-K keyboard shortcut', async ({ page }) => {
    await testHelpers.openCelestialSearchDialogWithKeyboard()
    
    // Verify dialog is open
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(page.locator('[placeholder*="Search celestial objects"]')).toBeVisible()
  })

  test('should display celestial objects above horizon', async ({ page }) => {
    await testHelpers.openCelestialSearchDialog()
    
    // Wait for objects to load
    await page.waitForTimeout(1000)
    
    // Should show some objects above horizon
    const objectCount = await testHelpers.getVisibleObjectCount()
    expect(objectCount).toBeGreaterThan(0)
    
    // Verify footer shows object count
    await expect(page.locator('text=/Showing \\d+ objects above horizon/')).toBeVisible()
  })

  test('should search and filter celestial objects', async ({ page }) => {
    await testHelpers.openCelestialSearchDialog()
    
    // Search for "Jupiter" (if it's visible)
    await testHelpers.searchForObject('Jupiter')
    
    // Check if results are filtered
    const searchResults = page.locator('[role="option"]')
    const resultCount = await searchResults.count()
    
    if (resultCount > 0) {
      // At least one result should contain "Jupiter"
      const firstResult = searchResults.first()
      await expect(firstResult).toContainText('Jupiter', { ignoreCase: true })
    }
  })

  test('should select object and show action buttons', async ({ page }) => {
    await testHelpers.openCelestialSearchDialog()
    
    // Wait for objects to load
    await page.waitForTimeout(1000)
    
    // Get the first available object
    const firstObject = page.locator('[role="option"]').first()
    await expect(firstObject).toBeVisible()
    
    // Click to select it
    await firstObject.click()
    
    // Verify action buttons appear
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
    await expect(page.locator('button:has-text("Goto"):not(:has-text("Image"))')).toBeVisible()
    await expect(page.locator('button:has-text("Goto & Image")')).toBeVisible()
  })

  test('should send goto message when Goto button is clicked', async ({ page }) => {
    await testHelpers.openCelestialSearchDialog()
    
    // Wait for objects and select the first one
    await page.waitForTimeout(1000)
    const firstObject = page.locator('[role="option"]').first()
    await firstObject.click()
    
    // Listen for console messages to verify WebSocket message
    const consoleMessages: string[] = []
    page.on('console', (msg) => {
      consoleMessages.push(msg.text())
    })
    
    // Click Goto button
    await testHelpers.clickGotoButton()
    
    // Wait briefly for message to be sent
    await page.waitForTimeout(500)
    
    // Dialog should close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    
    // Verify success toast appears
    await expect(page.locator('[data-sonner-toast]')).toBeVisible()
    await expect(page.locator('text=/Navigating telescope to/')).toBeVisible()
    
    // Verify goto message was sent (check console logs)
    const gotoMessage = consoleMessages.find(msg => 
      msg.includes('goto') && msg.includes('message')
    )
    expect(gotoMessage).toBeTruthy()
  })

  test('should send goto and image message when Goto & Image button is clicked', async ({ page }) => {
    await testHelpers.openCelestialSearchDialog()
    
    // Wait for objects and select the first one
    await page.waitForTimeout(1000)
    const firstObject = page.locator('[role="option"]').first()
    await firstObject.click()
    
    // Listen for console messages
    const consoleMessages: string[] = []
    page.on('console', (msg) => {
      consoleMessages.push(msg.text())
    })
    
    // Click Goto & Image button
    await testHelpers.clickGotoAndImageButton()
    
    // Wait briefly for message to be sent
    await page.waitForTimeout(500)
    
    // Dialog should close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    
    // Verify success toast appears with imaging message
    await expect(page.locator('[data-sonner-toast]')).toBeVisible()
    await expect(page.locator('text=/and starting imaging/')).toBeVisible()
    
    // Verify goto message with imaging=true was sent
    const gotoImageMessage = consoleMessages.find(msg => 
      msg.includes('goto') && msg.includes('imaging=true')
    )
    expect(gotoImageMessage).toBeTruthy()
  })

  test('should cancel and close dialog', async ({ page }) => {
    await testHelpers.openCelestialSearchDialog()
    
    // Wait for objects and select the first one
    await page.waitForTimeout(1000)
    const firstObject = page.locator('[role="option"]').first()
    await firstObject.click()
    
    // Click Cancel button
    await testHelpers.cancelCelestialSearch()
    
    // Dialog should be closed
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })

  test('should show object details with type, magnitude, and altitude', async ({ page }) => {
    await testHelpers.openCelestialSearchDialog()
    
    // Wait for objects to load
    await page.waitForTimeout(1000)
    
    // Get the first object
    const firstObject = page.locator('[role="option"]').first()
    await expect(firstObject).toBeVisible()
    
    // Verify it contains magnitude info
    await expect(firstObject.locator('text=/Mag \\d+/')).toBeVisible()
    
    // Verify it contains altitude info
    await expect(firstObject.locator('text=/\\d+\\.\\d+°/')).toBeVisible()
    
    // Verify it has an altitude badge
    const altitudeBadge = firstObject.locator('[class*="badge"]:has-text(/High|Med|Low/)')
    await expect(altitudeBadge).toBeVisible()
  })

  test('should group objects by type', async ({ page }) => {
    await testHelpers.openCelestialSearchDialog()
    
    // Wait for objects to load
    await page.waitForTimeout(1000)
    
    // Check if there are group headings
    const possibleGroups = [
      'Planets & Sun',
      'Moon', 
      'Galaxies',
      'Nebulae',
      'Star Clusters',
      'Double Stars'
    ]
    
    let foundGroups = 0
    for (const group of possibleGroups) {
      const groupHeading = page.locator(`text="${group}"`)
      if (await groupHeading.isVisible()) {
        foundGroups++
      }
    }
    
    // Should have at least one group
    expect(foundGroups).toBeGreaterThan(0)
  })

  test('should disable buttons when WebSocket is not connected', async ({ page }) => {
    // Mock failed WebSocket connection
    await mockWS.mockWebSocketFailure()
    
    await page.goto('/')
    await testHelpers.waitForAppReady()
    
    await testHelpers.openCelestialSearchDialog()
    
    // Wait for objects and select the first one
    await page.waitForTimeout(1000)
    const firstObject = page.locator('[role="option"]').first()
    await firstObject.click()
    
    // Goto buttons should be disabled due to no connection
    await expect(page.locator('button:has-text("Goto"):not(:has-text("Image"))')).toBeDisabled()
    await expect(page.locator('button:has-text("Goto & Image")')).toBeDisabled()
  })

  test('should show warning toast when WebSocket is disconnected', async ({ page }) => {
    // Mock failed WebSocket connection
    await mockWS.mockWebSocketFailure()
    
    await page.goto('/')
    await testHelpers.waitForAppReady()
    
    await testHelpers.openCelestialSearchDialog()
    
    // Wait for objects and select the first one
    await page.waitForTimeout(1000)
    const firstObject = page.locator('[role="option"]').first()
    await firstObject.click()
    
    // Force click the disabled button to trigger the warning
    const gotoButton = page.locator('button:has-text("Goto"):not(:has-text("Image"))')
    await gotoButton.click({ force: true })
    
    // Should show warning toast
    await expect(page.locator('[data-sonner-toast]')).toBeVisible()
    await expect(page.locator('text=/Telescope not connected/')).toBeVisible()
  })

  test('should close dialog when clicked outside', async ({ page }) => {
    await testHelpers.openCelestialSearchDialog()
    
    // Click outside the dialog (on the backdrop)
    await page.locator('[role="dialog"]').press('Escape')
    
    // Dialog should close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })
})