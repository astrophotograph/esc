#!/usr/bin/env node
/**
 * Test coordinate parsing in the frontend
 * Run with: node test-coordinate-parsing.js
 */

// Inline the parsing functions since we can't import ES modules directly
function parseRA(ra) {
  // Handle numeric input
  if (typeof ra === 'number') {
    return ra
  }
  
  // Handle string input
  if (!ra || typeof ra !== 'string') {
    return 0
  }
  
  // Try to parse as decimal degrees first
  const decimalValue = parseFloat(ra)
  if (!isNaN(decimalValue) && !ra.includes('h') && !ra.includes('m') && !ra.includes('s')) {
    return decimalValue
  }
  
  // Match various HMS formats with flexible spacing
  // Supports: "12h34m56s", "12h 34m 56s", "12h34m56.7s", etc.
  const matches = ra.match(/(\d+(?:\.\d+)?)\s*h\s*(\d+(?:\.\d+)?)\s*m\s*(\d+(?:\.\d+)?)\s*s?/i)
  if (!matches) {
    // Try colon format: "12:34:56"
    const colonMatches = ra.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (colonMatches) {
      const hours = parseFloat(colonMatches[1])
      const minutes = parseFloat(colonMatches[2])
      const seconds = parseFloat(colonMatches[3])
      return (hours + minutes / 60 + seconds / 3600) * 15
    }
    console.warn(`Unable to parse RA format: ${ra}`)
    return 0
  }
  
  const hours = parseFloat(matches[1])
  const minutes = parseFloat(matches[2])
  const seconds = parseFloat(matches[3])
  
  return (hours + minutes / 60 + seconds / 3600) * 15 // Convert hours to degrees
}

function parseDec(dec) {
  // Handle numeric input
  if (typeof dec === 'number') {
    return dec
  }
  
  // Handle string input
  if (!dec || typeof dec !== 'string') {
    return 0
  }
  
  // Try to parse as decimal degrees first
  const decimalValue = parseFloat(dec)
  if (!isNaN(decimalValue) && !dec.includes('°') && !dec.includes('′') && !dec.includes('″')) {
    return decimalValue
  }
  
  // Match various DMS formats with flexible spacing and optional symbols
  // Supports: "+45°12′34″", "-45° 12′ 34″", "45d12m34s", etc.
  const matches = dec.match(/([+-]?)(\d+(?:\.\d+)?)\s*[°d]\s*(\d+(?:\.\d+)?)\s*[′'m]?\s*(\d+(?:\.\d+)?)\s*[″"s]?/i)
  if (!matches) {
    // Try colon format: "-45:12:34"
    const colonMatches = dec.match(/([+-]?)(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (colonMatches) {
      const sign = colonMatches[1] === '-' ? -1 : 1
      const degrees = parseFloat(colonMatches[2])
      const arcminutes = parseFloat(colonMatches[3])
      const arcseconds = parseFloat(colonMatches[4])
      return sign * (degrees + arcminutes / 60 + arcseconds / 3600)
    }
    console.warn(`Unable to parse Dec format: ${dec}`)
    return 0
  }
  
  const sign = matches[1] === '-' ? -1 : 1
  const degrees = parseFloat(matches[2])
  const arcminutes = parseFloat(matches[3])
  const arcseconds = parseFloat(matches[4])
  
  return sign * (degrees + arcminutes / 60 + arcseconds / 3600)
}

// Test cases
console.log('Testing RA parsing:')
const raTests = [
  ['12h34m56s', 188.73333333333332],
  ['12h 34m 56s', 188.73333333333332],  // With spaces (problematic format)
  ['12:34:56', 188.73333333333332],
  ['0h 42m 44s', 10.683333333333334],  // Andromeda Galaxy
  [188.73333, 188.73333],  // Numeric
]

for (const [input, expected] of raTests) {
  const result = parseRA(input)
  const pass = Math.abs(result - expected) < 0.001
  console.log(`  ${pass ? '✓' : '✗'} "${input}" → ${result.toFixed(5)}° (expected ${expected.toFixed(5)}°)`)
}

console.log('\nTesting Dec parsing:')
const decTests = [
  ['+45°12′34″', 45.20944444444444],
  ['-45°12′34″', -45.20944444444444],
  ['+45° 12′ 34″', 45.20944444444444],  // With spaces (problematic format)
  ['-45° 12′ 34″', -45.20944444444444],  // With spaces (problematic format)
  ['45:12:34', 45.20944444444444],
  ['-23° 45′ 0″', -23.75],  // Negative with spaces
  [45.20944, 45.20944],  // Numeric
]

for (const [input, expected] of decTests) {
  const result = parseDec(input)
  const pass = Math.abs(result - expected) < 0.001
  console.log(`  ${pass ? '✓' : '✗'} "${input}" → ${result.toFixed(5)}° (expected ${expected.toFixed(5)}°)`)
}

console.log('\n✨ Frontend coordinate parsing tests complete!')