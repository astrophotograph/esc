import {z} from "zod"


export const Telescope = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number(),
  // description: z.string(),
  // image: z.string(),
  // type: z.string(),
  location: z.string(),
  connected: z.boolean(),
  serial_number: z.string(),
  product_model: z.string(),
  ssid: z.string(),
  is_remote: z.boolean(),
  // altitude: z.number(),
  // diameter: z.number(),
  // mass: z.number(),
})

// todo : cache the telescopes?

export function getTelescopeBaseUrl() {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  return `${backendUrl}/api/telescopes`
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

