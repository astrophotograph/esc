// API abstraction layer
// Supports both Tauri (desktop) and Web modes

const isTauri = '__TAURI_INTERNALS__' in window

// Tauri API
async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
  return tauriInvoke<T>(command, args)
}

// Web API fallback
async function invokeWeb<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/${command}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args || {}),
  })

  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`)
  }

  return response.json()
}

// Main invoke function that automatically selects the right backend
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return invokeTauri<T>(command, args)
  } else {
    return invokeWeb<T>(command, args)
  }
}

// Runtime environment check
export const runtime = {
  isTauri,
  isWeb: !isTauri,
}
