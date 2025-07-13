import { Page, expect } from '@playwright/test'

/**
 * Test utilities for the ALP Experimental telescope application
 */

export class TelescopeTestHelpers {
  constructor(private page: Page) {}

  /**
   * Wait for the application to load and be ready
   */
  async waitForAppReady(): Promise<void> {
    // Wait for the main telescope control page to load
    await this.page.waitForSelector('[data-testid="telescope-control"]', { timeout: 10000 })
    
    // Wait for any loading spinners to disappear
    await this.page.waitForSelector('[data-testid="loading"]', { state: 'detached', timeout: 5000 }).catch(() => {
      // Loading indicator might not exist, that's ok
    })
  }

  /**
   * Open the celestial search dialog using the Search button
   */
  async openCelestialSearchDialog(): Promise<void> {
    // Look for the Search button in the camera view header
    const searchButton = this.page.locator('button[title*="Search Celestial Objects"]')
    await expect(searchButton).toBeVisible()
    await searchButton.click()
    
    // Wait for the dialog to open
    await this.page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    await expect(this.page.locator('[role="dialog"]')).toBeVisible()
  }

  /**
   * Open the celestial search dialog using Cmd-K keyboard shortcut
   */
  async openCelestialSearchDialogWithKeyboard(): Promise<void> {
    // Press Cmd-K (or Ctrl-K on Windows/Linux)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await this.page.keyboard.press(`${modifier}+KeyK`)
    
    // Wait for the dialog to open
    await this.page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    await expect(this.page.locator('[role="dialog"]')).toBeVisible()
  }

  /**
   * Search for a celestial object in the search dialog
   */
  async searchForObject(objectName: string): Promise<void> {
    const searchInput = this.page.locator('[placeholder*="Search celestial objects"]')
    await expect(searchInput).toBeVisible()
    await searchInput.fill(objectName)
    
    // Wait for search results to appear
    await this.page.waitForTimeout(500) // Brief delay for search to process
  }

  /**
   * Select a celestial object from the search results
   */
  async selectCelestialObject(objectName: string): Promise<void> {
    const objectItem = this.page.locator(`[role="option"]:has-text("${objectName}")`)
    await expect(objectItem).toBeVisible()
    await objectItem.click()
    
    // Wait for the object to be selected (action buttons should appear)
    await this.page.waitForSelector('button:has-text("Goto")', { timeout: 3000 })
  }

  /**
   * Click the Goto button in the celestial search dialog
   */
  async clickGotoButton(): Promise<void> {
    const gotoButton = this.page.locator('button:has-text("Goto"):not(:has-text("Image"))')
    await expect(gotoButton).toBeVisible()
    await expect(gotoButton).toBeEnabled()
    await gotoButton.click()
  }

  /**
   * Click the "Goto & Image" button in the celestial search dialog
   */
  async clickGotoAndImageButton(): Promise<void> {
    const gotoImageButton = this.page.locator('button:has-text("Goto & Image")')
    await expect(gotoImageButton).toBeVisible()
    await expect(gotoImageButton).toBeEnabled()
    await gotoImageButton.click()
  }

  /**
   * Cancel the celestial search dialog
   */
  async cancelCelestialSearch(): Promise<void> {
    const cancelButton = this.page.locator('button:has-text("Cancel")')
    await expect(cancelButton).toBeVisible()
    await cancelButton.click()
    
    // Wait for dialog to close
    await expect(this.page.locator('[role="dialog"]')).not.toBeVisible()
  }

  /**
   * Toggle scenery mode using the Mountain button
   */
  async toggleSceneryMode(): Promise<void> {
    // Look for the Mountain icon button near the PIP button
    const sceneryButton = this.page.locator('button[title*="Scenery"]')
    await expect(sceneryButton).toBeVisible()
    await sceneryButton.click()
  }

  /**
   * Wait for and verify a WebSocket message was sent (by checking console logs)
   */
  async waitForWebSocketMessage(messageType: string, timeout: number = 5000): Promise<void> {
    let messageFound = false
    const startTime = Date.now()
    
    // Listen for console messages
    this.page.on('console', (msg) => {
      if (msg.text().includes(messageType) && msg.text().includes('message')) {
        messageFound = true
      }
    })
    
    // Wait for the message or timeout
    while (!messageFound && (Date.now() - startTime) < timeout) {
      await this.page.waitForTimeout(100)
    }
    
    if (!messageFound) {
      throw new Error(`WebSocket message "${messageType}" not found within ${timeout}ms`)
    }
  }

  /**
   * Check if a specific celestial object is visible in search results
   */
  async isObjectVisible(objectName: string): Promise<boolean> {
    try {
      const objectItem = this.page.locator(`[role="option"]:has-text("${objectName}")`)
      await expect(objectItem).toBeVisible({ timeout: 2000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get the count of visible celestial objects in the search dialog
   */
  async getVisibleObjectCount(): Promise<number> {
    const countText = await this.page.locator('text=/Showing \\d+ objects above horizon/').textContent()
    if (!countText) return 0
    
    const match = countText.match(/Showing (\d+) objects/)
    return match ? parseInt(match[1], 10) : 0
  }

  /**
   * Verify the dialog shows the keyboard shortcut hint
   */
  async verifyKeyboardShortcutHint(): Promise<void> {
    const shortcutHint = this.page.locator('kbd:has-text("⌘K")')
    await expect(shortcutHint).toBeVisible()
  }

  /**
   * Wait for and verify a toast notification appears
   */
  async waitForToast(type: 'success' | 'error' | 'warning', messagePattern: string | RegExp, timeout: number = 5000): Promise<void> {
    await this.page.waitForSelector('[data-sonner-toast]', { timeout })
    await expect(this.page.locator('[data-sonner-toast]')).toBeVisible()
    
    if (typeof messagePattern === 'string') {
      await expect(this.page.locator(`text=${messagePattern}`)).toBeVisible()
    } else {
      await expect(this.page.locator(`text=${messagePattern}`)).toBeVisible()
    }
  }
}

/**
 * Mock WebSocket responses for testing
 */
export class MockWebSocketHelpers {
  constructor(private page: Page) {}

  /**
   * Mock a successful WebSocket connection
   */
  async mockWebSocketConnection(): Promise<void> {
    await this.page.addInitScript(() => {
      // Mock WebSocket for testing
      class MockWebSocket extends EventTarget {
        public readyState = WebSocket.OPEN
        public url: string
        
        constructor(url: string) {
          super()
          this.url = url
          setTimeout(() => {
            this.dispatchEvent(new Event('open'))
          }, 100)
        }
        
        send(data: string) {
          console.log('MockWebSocket: Sent message:', data)
          // Simulate command response
          setTimeout(() => {
            const message = {
              id: 'response-123',
              type: 'command_response',
              timestamp: Date.now(),
              payload: {
                command_id: 'test-command',
                success: true,
                result: {}
              }
            }
            this.dispatchEvent(new MessageEvent('message', { 
              data: JSON.stringify(message) 
            }))
          }, 200)
        }
        
        close() {
          this.readyState = WebSocket.CLOSED
          this.dispatchEvent(new Event('close'))
        }
      }
      
      window.WebSocket = MockWebSocket as any
    })
  }

  /**
   * Mock a failed WebSocket connection
   */
  async mockWebSocketFailure(): Promise<void> {
    await this.page.addInitScript(() => {
      class FailingWebSocket extends EventTarget {
        public readyState = WebSocket.CLOSED
        
        constructor(url: string) {
          super()
          setTimeout(() => {
            this.dispatchEvent(new Event('error'))
          }, 100)
        }
        
        send() {
          throw new Error('WebSocket not connected')
        }
        
        close() {}
      }
      
      window.WebSocket = FailingWebSocket as any
    })
  }
}