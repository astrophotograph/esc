import { TelescopeControl } from './components/TelescopeControl'
import { EnhancedHeader } from './components/EnhancedHeader'

function App() {
  return (
    <div className="min-h-screen bg-background">
      <EnhancedHeader />

      <main className="max-w-7xl mx-auto p-6 h-[calc(100vh-100px)]">
        <TelescopeControl />
      </main>
    </div>
  )
}

export default App
