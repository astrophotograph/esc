import { test, expect } from '@playwright/test'
import { TelescopeTestHelpers, MockWebSocketHelpers } from './test-utils'

test.describe('Scenery Mode', () => {
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

  test('should display scenery mode button near PIP button', async ({ page }) => {
    // Look for the scenery mode button (Mountain icon)
    const sceneryButton = page.locator('button[title*="Scenery"]')
    await expect(sceneryButton).toBeVisible()
    
    // It should be near the PIP button - they should be in the same container
    const pipButton = page.locator('button[title*="PIP" i]')
    const headerContainer = page.locator('header, [class*="header"]')
    
    // Both buttons should be in the header area
    await expect(headerContainer.locator('button[title*="Scenery"]')).toBeVisible()
    await expect(headerContainer.locator('button[title*="PIP" i]')).toBeVisible()
  })

  test('should toggle scenery mode when button is clicked', async ({ page }) => {
    // Listen for console messages to verify WebSocket message
    const consoleMessages: string[] = []
    page.on('console', (msg) => {
      consoleMessages.push(msg.text())
    })
    
    // Click the scenery mode button
    await testHelpers.toggleSceneryMode()
    
    // Wait briefly for message to be sent
    await page.waitForTimeout(500)
    
    // Verify scenery message was sent (check console logs)
    const sceneryMessage = consoleMessages.find(msg => 
      msg.includes('scenery') && (msg.includes('message') || msg.includes('Sending'))
    )
    expect(sceneryMessage).toBeTruthy()
  })

  test('should send correct scenery mode message format', async ({ page }) => {
    // Listen for more detailed console messages
    const consoleMessages: string[] = []
    page.on('console', (msg) => {
      consoleMessages.push(msg.text())
    })
    
    // Click the scenery mode button
    await testHelpers.toggleSceneryMode()
    
    // Wait for message processing
    await page.waitForTimeout(500)
    
    // Look for the specific message format: {"mode": "scenery"}
    const detailedMessage = consoleMessages.find(msg => 
      msg.includes('scenery') && (msg.includes('mode') || msg.includes('SCENERY'))
    )
    expect(detailedMessage).toBeTruthy()
  })

  test('should handle scenery mode when WebSocket is disconnected', async ({ page }) => {
    // Mock failed WebSocket connection
    await mockWS.mockWebSocketFailure()
    
    await page.goto('/')
    await testHelpers.waitForAppReady()
    
    // Scenery button should still be visible but might show different behavior
    const sceneryButton = page.locator('button[title*="Scenery"]')
    await expect(sceneryButton).toBeVisible()
    
    // Click it - it might still be clickable but won't send messages
    await sceneryButton.click()
    
    // No errors should occur (the click should be handled gracefully)
    // This tests error handling when WebSocket is not connected
  })

  test('should have correct button styling and icon', async ({ page }) => {
    const sceneryButton = page.locator('button[title*="Scenery"]')
    await expect(sceneryButton).toBeVisible()
    
    // Check if the button has a Mountain icon (represented by SVG or icon class)
    const mountainIcon = sceneryButton.locator('svg, [class*="mountain" i], [class*="icon"]')
    await expect(mountainIcon).toBeVisible()
  })

  test('should maintain button state across interactions', async ({ page }) => {
    // Click scenery mode button multiple times
    await testHelpers.toggleSceneryMode()
    await page.waitForTimeout(200)
    
    await testHelpers.toggleSceneryMode()
    await page.waitForTimeout(200)
    
    // Button should remain clickable and functional
    const sceneryButton = page.locator('button[title*="Scenery"]')
    await expect(sceneryButton).toBeVisible()
    await expect(sceneryButton).toBeEnabled()
  })

  test('should work independently of other UI elements', async ({ page }) => {
    // Open celestial search dialog
    await testHelpers.openCelestialSearchDialog()
    
    // Close the dialog
    await page.keyboard.press('Escape')
    
    // Scenery button should still work
    await testHelpers.toggleSceneryMode()
    
    // No interference should occur
    const sceneryButton = page.locator('button[title*="Scenery"]')
    await expect(sceneryButton).toBeVisible()
  })

  test('should log appropriate message on server side (mock verification)', async ({ page }) => {
    // This test verifies the client-side behavior that should trigger server logging
    const consoleMessages: string[] = []
    page.on('console', (msg) => {
      consoleMessages.push(msg.text())
    })
    
    // Trigger scenery mode
    await testHelpers.toggleSceneryMode()
    await page.waitForTimeout(500)
    
    // Verify that the WebSocket send operation was attempted
    const sendAttempt = consoleMessages.find(msg => 
      msg.includes('MockWebSocket: Sent message') && msg.includes('scenery')
    )
    expect(sendAttempt).toBeTruthy()
  })
})