import { test, expect } from '@playwright/test'
import { TelescopeTestHelpers, MockWebSocketHelpers } from './test-utils'

test.describe('Status Indicators Threshold Warnings', () => {
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

  test('should display battery indicator without border when level is normal', async ({ page }) => {
    // Mock normal battery level (above 20%)
    await page.addInitScript(() => {
      window.mockTelescopeStatus = {
        battery_capacity: 75,
        charger_status: "Normal"
      }
    })
    
    await page.reload()
    await testHelpers.waitForAppReady()
    
    // Check battery threshold borders
    const batteryBorders = await testHelpers.checkBatteryThresholdBorder()
    expect(batteryBorders.hasWarning).toBe(false)
    expect(batteryBorders.hasCritical).toBe(false)
  })

  test('should display battery indicator with yellow border when level is low', async ({ page }) => {
    // Mock low battery level (warning range: 11-20%)
    await page.addInitScript(() => {
      window.mockTelescopeStatus = {
        battery_capacity: 15,
        charger_status: "Normal"
      }
    })
    
    await page.reload()
    await testHelpers.waitForAppReady()
    
    // Check for yellow border on battery indicator
    const batteryContainer = page.locator('div').filter({ 
      has: page.locator('text=/15%/') 
    }).filter({ 
      has: page.locator('svg') 
    })
    
    await expect(batteryContainer.locator('.border-yellow-500')).toBeVisible()
  })

  test('should display battery indicator with red border when level is critical', async ({ page }) => {
    // Mock critical battery level (≤10%)
    await page.addInitScript(() => {
      window.mockTelescopeStatus = {
        battery_capacity: 8,
        charger_status: "Normal"
      }
    })
    
    await page.reload()
    await testHelpers.waitForAppReady()
    
    // Check for red border on battery indicator
    const batteryContainer = page.locator('div').filter({ 
      has: page.locator('text=/8%/') 
    }).filter({ 
      has: page.locator('svg') 
    })
    
    await expect(batteryContainer.locator('.border-red-500')).toBeVisible()
  })

  test('should display disk usage indicator without border when usage is normal', async ({ page }) => {
    // Mock normal disk usage (below 80%)
    await page.addInitScript(() => {
      window.mockSystemStats = {
        diskUsage: 65
      }
    })
    
    await page.reload()
    await testHelpers.waitForAppReady()
    
    // Check disk usage threshold borders
    const diskBorders = await testHelpers.checkDiskUsageThresholdBorder()
    expect(diskBorders.hasWarning).toBe(false)
    expect(diskBorders.hasCritical).toBe(false)
  })

  test('should display disk usage indicator with yellow border when usage is high', async ({ page }) => {
    // Mock high disk usage (warning range: 80-89%)
    await page.addInitScript(() => {
      window.mockSystemStats = {
        diskUsage: 85
      }
    })
    
    await page.reload()
    await testHelpers.waitForAppReady()
    
    // Check for yellow border on disk usage indicator
    const diskContainer = page.locator('div').filter({ 
      has: page.locator('text=/85%/') 
    }).filter({ 
      has: page.locator('svg[data-lucide="hard-drive"]') 
    })
    
    await expect(diskContainer.locator('.border-yellow-500')).toBeVisible()
  })

  test('should display disk usage indicator with red border when usage is critical', async ({ page }) => {
    // Mock critical disk usage (≥90%)
    await page.addInitScript(() => {
      window.mockSystemStats = {
        diskUsage: 95
      }
    })
    
    await page.reload()
    await testHelpers.waitForAppReady()
    
    // Check for red border on disk usage indicator
    const diskContainer = page.locator('div').filter({ 
      has: page.locator('text=/95%/') 
    }).filter({ 
      has: page.locator('svg[data-lucide="hard-drive"]') 
    })
    
    await expect(diskContainer.locator('.border-red-500')).toBeVisible()
  })

  test('should display both battery and disk indicators with borders when both are at threshold', async ({ page }) => {
    // Mock both battery and disk at warning levels
    await page.addInitScript(() => {
      window.mockTelescopeStatus = {
        battery_capacity: 18,
        charger_status: "Normal"
      }
      window.mockSystemStats = {
        diskUsage: 82
      }
    })
    
    await page.reload()
    await testHelpers.waitForAppReady()
    
    // Check that both indicators have yellow borders
    const batteryContainer = page.locator('div').filter({ 
      has: page.locator('text=/18%/') 
    }).filter({ 
      has: page.locator('svg') 
    })
    
    const diskContainer = page.locator('div').filter({ 
      has: page.locator('text=/82%/') 
    }).filter({ 
      has: page.locator('svg[data-lucide="hard-drive"]') 
    })
    
    await expect(batteryContainer.locator('.border-yellow-500')).toBeVisible()
    await expect(diskContainer.locator('.border-yellow-500')).toBeVisible()
  })

  test('should show proper border colors when battery is charging', async ({ page }) => {
    // Mock charging battery with low level
    await page.addInitScript(() => {
      window.mockTelescopeStatus = {
        battery_capacity: 12,
        charger_status: "Charging"
      }
    })
    
    await page.reload()
    await testHelpers.waitForAppReady()
    
    // Even when charging, low battery should still show border warning
    const batteryContainer = page.locator('div').filter({ 
      has: page.locator('text=/12%/') 
    }).filter({ 
      has: page.locator('svg[data-lucide="battery-charging"]') 
    })
    
    await expect(batteryContainer.locator('.border-yellow-500')).toBeVisible()
  })

  test('should show proper border colors when battery is full', async ({ page }) => {
    // Mock full battery
    await page.addInitScript(() => {
      window.mockTelescopeStatus = {
        battery_capacity: 100,
        charger_status: "Full"
      }
    })
    
    await page.reload()
    await testHelpers.waitForAppReady()
    
    // Full battery should not show any border warning
    const batteryContainer = page.locator('div').filter({ 
      has: page.locator('text=/100%/') 
    }).filter({ 
      has: page.locator('svg[data-lucide="battery-full"]') 
    })
    
    await expect(batteryContainer.locator('.border-yellow-500')).not.toBeVisible()
    await expect(batteryContainer.locator('.border-red-500')).not.toBeVisible()
  })
})