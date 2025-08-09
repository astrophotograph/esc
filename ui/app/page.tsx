"use client"

import { useEffect } from "react"
import TelescopeControl from "../telescope-control"
import { initializeMonitoring } from "@/utils/monitoring"

export default function Page() {
  useEffect(() => {
    // Initialize monitoring when the app loads
    initializeMonitoring()
  }, [])
  
  return (
    <div>
      <TelescopeControl />
    </div>
  )
}
