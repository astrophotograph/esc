import {z} from "zod"


export const Telescope = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number(),
  // description: z.string(),
  // image: z.string(),
  // type: z.string(),
  location: z.string().optional(),
  connected: z.boolean(),
  serial_number: z.string(),
  product_model: z.string(),
  ssid: z.string().optional(),
  is_remote: z.boolean().optional(),
  discovery_method: z.string().optional(), // "manual" or "auto_discovery"
  // altitude: z.number(),
  // diameter: z.number(),
  // mass: z.number(),
})

// todo : cache the telescopes?

export function getTelescopeBaseUrl() {
  // Use NextJS proxy instead of direct backend calls
  return '/api/telescopes'
}

export function getBackendBaseUrl() {
  // Use NextJS proxy instead of direct backend calls
  return '/api'
}

export async function fetchTelescopes() {
  const telescopesUrl = getTelescopeBaseUrl()

  console.log(`Fetching telescopes from: ${telescopesUrl}`)

  const response = await fetch(telescopesUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    // Add timeout to prevent hanging requests
    signal: AbortSignal.timeout(10000), // 10 second timeout
  })

  const json = await response.json()

  return Telescope.array().parse(json)
}

export async function addManualTelescope(telescope: unknown) {
  const telescopesUrl = getTelescopeBaseUrl()

  console.log(`Adding manual telescope to: ${telescopesUrl}`)

  try {
    const response = await fetch(telescopesUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(telescope),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    })

    if (!response.ok) {
      // If the backend doesn't support manual telescopes yet, we'll get a 404 or 405
      if (response.status === 404 || response.status === 405) {
        console.warn('Backend does not support manual telescope management yet')
        throw new Error('Backend does not support manual telescope management')
      }
      throw new Error(`Failed to add telescope: ${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    return Telescope.parse(json)
  } catch (error) {
    console.error('Error calling backend for manual telescope addition:', error)
    throw error
  }
}

export async function removeManualTelescope(telescopeId: string) {
  const telescopesUrl = `${getTelescopeBaseUrl()}/${telescopeId}`

  console.log(`Removing telescope from: ${telescopesUrl}`)

  try {
    const response = await fetch(telescopesUrl, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    })

    if (!response.ok) {
      // If the backend doesn't support manual telescopes yet, we'll get a 404 or 405
      if (response.status === 404 || response.status === 405) {
        console.warn('Backend does not support manual telescope management yet')
        throw new Error('Backend does not support manual telescope management')
      }
      throw new Error(`Failed to remove telescope: ${response.status} ${response.statusText}`)
    }

    return response.json()
  } catch (error) {
    console.error('Error calling backend for manual telescope removal:', error)
    throw error
  }
}

