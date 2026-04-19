import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // console.error surfaces in Tauri's WebKit log (visible via system log / Console.app)
    console.error(`[ErrorBoundary:${this.props.label ?? 'unknown'}]`, error.message, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
          <p className="text-destructive font-semibold text-sm">
            {this.props.label ? `${this.props.label}: ` : ''}Render error
          </p>
          <pre className="text-xs text-muted-foreground bg-muted rounded p-3 max-w-lg overflow-auto text-left whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <button
            className="text-xs underline text-muted-foreground"
            onClick={() => this.setState({ error: null })}
          >
            Dismiss
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
