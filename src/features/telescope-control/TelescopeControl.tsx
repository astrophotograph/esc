import './TelescopeControl.css'

export function TelescopeControl() {
  // TODO: Add state management when implementing telescope control
  // const [connection, setConnection] = useState<TelescopeConnection | null>(null)
  // const [status, setStatus] = useState<TelescopeStatus | null>(null)

  return (
    <div className="telescope-control">
      <h2>Telescope Control</h2>
      <div className="control-sections">
        <section className="connection-section">
          <h3>Connection</h3>
          <p className="placeholder">Telescope connection controls will be implemented here</p>
        </section>

        <section className="status-section">
          <h3>Status</h3>
          <p className="placeholder">Telescope status display will be implemented here</p>
        </section>

        <section className="control-section">
          <h3>Controls</h3>
          <p className="placeholder">Mount controls (slew, track, park) will be implemented here</p>
        </section>
      </div>
    </div>
  )
}
