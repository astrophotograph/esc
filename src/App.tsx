import { TelescopeControl } from './components/TelescopeControl'

function App() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-foreground">EESC</h1>
          <p className="text-sm text-muted-foreground">Enhanced Equipment & Seestar Control</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 h-[calc(100vh-100px)]">
        <TelescopeControl />
      </main>
    </div>
  )
}

export default App
