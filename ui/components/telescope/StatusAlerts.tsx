"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Info, X } from "lucide-react"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { getAlertVariant } from "../../utils/telescope-utils"

export function StatusAlerts() {
  const { statusAlerts, dismissAlert } = useTelescopeContext()

  return (
    <div className="space-y-2 mb-4">
      {statusAlerts
        .filter((alert) => !alert.dismissed)
        .slice(0, 3)
        .map((alert) => (
          <Alert
            key={alert.id}
            variant={getAlertVariant(alert.type)}
            className={`transition-all duration-300 ${
              alert.type === "success"
                ? "border-green-500 text-green-500"
                : alert.type === "error"
                  ? "border-red-500 text-red-500"
                  : alert.type === "warning"
                    ? "border-yellow-500 text-yellow-500"
                    : "border-blue-500 text-blue-500"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {alert.type === "error" && <AlertTriangle className="h-4 w-4" />}
                {alert.type === "warning" && <AlertTriangle className="h-4 w-4" />}
                {alert.type === "success" && <div className="h-4 w-4">✓</div>}
                {alert.type === "info" && <Info className="h-4 w-4" />}
                <AlertTitle>{alert.title}</AlertTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissAlert(alert.id)}
                className="h-6 w-6 p-0 hover:bg-transparent hover:opacity-75"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <AlertDescription className="ml-6">{alert.message}</AlertDescription>
          </Alert>
        ))}
    </div>
  )
}
