import { useState } from 'react'
import { invoke } from './services/api'
import './styles/App.css'

function App() {
  const [greeting, setGreeting] = useState('')
  const [name, setName] = useState('')

  async function greet() {
    const message = await invoke<string>('greet', { name })
    setGreeting(message)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>EESC - Telescope Control</h1>
        <p>Observation Planning | Image Management | Telescope Control</p>
      </header>

      <main className="app-main">
        <div className="demo-section">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
          />
          <button onClick={greet}>Greet</button>
          {greeting && <p className="greeting">{greeting}</p>}
        </div>
      </main>
    </div>
  )
}

export default App
