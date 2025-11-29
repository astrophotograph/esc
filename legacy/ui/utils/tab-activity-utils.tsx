"use client"

import type { TabActivityState } from "../context/TelescopeContext"
import type { StatusAlert, Equipment, Session, CelestialObject } from "../types/telescope-types"

export function updateTabActivity(
  currentActivity: TabActivityState,
  context: {
    activeSession: Session | null
    statusAlerts: StatusAlert[]
    equipment: Equipment[]
    selectedTarget: CelestialObject | null
    observationNotes: string
    observationRating: number
    celestialObjects: CelestialObject[]
  },
): TabActivityState {
  const {
    activeSession,
    statusAlerts,
    equipment,
    selectedTarget,
    observationNotes,
    observationRating,
    celestialObjects,
  } = context

  // Calculate session activity
  const sessionActivity = {
    isActive: !!activeSession,
    hasNotifications: statusAlerts.some((alert) => alert.title.toLowerCase().includes("session") && !alert.dismissed),
  }

  // Calculate targets activity
  const visibleTargets = celestialObjects.filter((obj) => obj.isVisible).length
  const targetsActivity = {
    hasRecommendations: visibleTargets > 0,
    count: visibleTargets,
  }

  // Calculate observation activity
  const observationActivity = {
    hasUnsavedChanges: !!(selectedTarget && (observationNotes || observationRating !== 3)),
    recentCount: 0, // Could be calculated from recent observations
  }

  // Calculate telescope activity
  const telescopeAlerts = statusAlerts.filter(
    (alert) => (alert.type === "error" || alert.title.toLowerCase().includes("telescope")) && !alert.dismissed,
  )
  const telescopeActivity = {
    isMoving: statusAlerts.some((alert) => alert.title.toLowerCase().includes("moving") && !alert.dismissed),
    hasIssues: telescopeAlerts.length > 0,
    needsAttention: telescopeAlerts.some((alert) => alert.type === "error"),
  }

  // Calculate environment activity
  const weatherAlerts = statusAlerts.filter(
    (alert) => alert.title.toLowerCase().includes("weather") && !alert.dismissed,
  )
  const environmentActivity = {
    hasAlerts: weatherAlerts.length > 0,
    conditionChange: weatherAlerts.some((alert) => alert.type === "warning"),
  }

  // Calculate equipment activity
  const needsMaintenance = equipment.filter((eq) => {
    if (!eq.maintenance.nextMaintenance) return false
    return new Date(eq.maintenance.nextMaintenance) <= new Date()
  }).length

  const hasIssues = equipment.filter((eq) => eq.condition === "poor").length

  const equipmentActivity = {
    hasIssues: hasIssues > 0,
    needsMaintenance: needsMaintenance > 0,
    count: hasIssues + needsMaintenance,
  }

  return {
    session: sessionActivity,
    targets: targetsActivity,
    observation: observationActivity,
    telescope: telescopeActivity,
    environment: environmentActivity,
    equipment: equipmentActivity,
  }
}
