import './SessionPlanning.css'

export function SessionPlanning() {
  // TODO: Add state management when implementing session planning
  // const [sessions, setSessions] = useState<ObservationSession[]>([])
  // const [selectedSession, setSelectedSession] = useState<ObservationSession | null>(null)

  return (
    <div className="session-planning">
      <h2>Session Planning</h2>
      <div className="planning-sections">
        <section className="session-list-section">
          <h3>Sessions</h3>
          <p className="placeholder">Session list and creation will be implemented here</p>
        </section>

        <section className="target-selection-section">
          <h3>Target Selection</h3>
          <p className="placeholder">Target catalog and selection will be implemented here</p>
        </section>

        <section className="visibility-section">
          <h3>Visibility Analysis</h3>
          <p className="placeholder">
            Sky chart and visibility calculations will be implemented here
          </p>
        </section>
      </div>
    </div>
  )
}
