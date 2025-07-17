"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { X, ChevronLeft, ChevronRight } from "lucide-react"

interface TourStep {
  target: string
  title: string
  content: string
  placement?: "top" | "bottom" | "left" | "right"
}

const tourSteps: TourStep[] = [
  {
    target: "body",
    title: "Welcome to ALP Experimental!",
    content: "This tour will guide you through the main features of the telescope control application.",
    placement: "bottom",
  },
  {
    target: "[data-tour='telescope-selector']",
    title: "Telescope Selector",
    content: "Select and manage your telescopes here. You can connect to multiple Seestar telescopes and switch between them.",
    placement: "bottom",
  },
  {
    target: "[data-tour='notification-bell']",
    title: "Notifications",
    content: "Important notifications will appear here for events like imaging completion, weather alerts, or system messages.",
    placement: "bottom",
  },
  {
    target: "[data-tour='pip-toggle']",
    title: "Picture-in-Picture Mode",
    content: "Enable Picture-in-Picture mode to keep the camera view visible while using other applications.",
    placement: "bottom",
  },
  {
    target: "[data-tour='scenery-mode']",
    title: "Scenery Mode",
    content: "Toggle scenery mode for a simplified interface optimized for landscape astrophotography.",
    placement: "bottom",
  },
  {
    target: "[data-tour='user-menu']",
    title: "User Menu",
    content: "Access your profile, settings, documentation, and other options from the user menu.",
    placement: "left",
  },
  {
    target: "[data-tour='quick-actions']",
    title: "Quick Actions",
    content: "Quick action buttons for common tasks: planning sessions, equipment management, and celestial object search.",
    placement: "top",
  },
  {
    target: "[data-tour='camera-view']",
    title: "Camera View",
    content: "This is the main camera view where you'll see the live feed from your telescope. You can adjust exposure, gain, and other camera settings.",
    placement: "right",
  },
  {
    target: "[data-tour='control-panel']",
    title: "Control Panel",
    content: "The control panel contains all telescope controls organized in tabs: Telescope controls, Environment monitoring, and Imaging metrics.",
    placement: "left",
  },
  {
    target: "[data-tour='telescope-controls-tab']",
    title: "Telescope Controls",
    content: "Use these controls to operate your telescope: slew, focus, and capture images. You can also access advanced settings here.",
    placement: "top",
  },
  {
    target: "[data-tour='environment-tab']",
    title: "Environment Monitoring",
    content: "Monitor environmental conditions like temperature, humidity, and seeing conditions to optimize your observations.",
    placement: "top",
  },
  {
    target: "[data-tour='imaging-metrics-tab']",
    title: "Imaging Metrics",
    content: "Track your imaging session metrics: exposure count, total integration time, and image quality statistics.",
    placement: "top",
  },
  {
    target: "[data-tour='user-menu']",
    title: "Re-running the Tour",
    content: "You can restart this tour anytime by clicking on your profile menu and selecting 'Start Tour'. This is helpful if you want to review the features again or show them to someone else.",
    placement: "left",
  },
]

export function AppTour() {
  const [isRunning, setIsRunning] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const { setShowKeyboardHelp } = useTelescopeContext()
  const tourRef = useRef<HTMLDivElement>(null)

  // Check if this is the user's first visit
  useEffect(() => {
    const hasSeenTour = localStorage.getItem("alp-tour-completed")
    const skipTour = localStorage.getItem("alp-tour-skip")
    
    if (!hasSeenTour && !skipTour) {
      // Delay the tour start to ensure all components are mounted
      setTimeout(() => {
        setIsRunning(true)
      }, 1500)
    }
  }, [])

  // Position the tour tooltip
  useEffect(() => {
    if (!isRunning) return

    const positionTooltip = () => {
      const step = tourSteps[currentStep]
      if (step.target === "body") {
        // Center the tooltip for the welcome message
        setPosition({
          top: window.innerHeight / 2 - 100,
          left: window.innerWidth / 2 - 200,
        })
        return
      }

      const element = document.querySelector(step.target)
      if (!element) {
        console.warn(`Tour target not found: ${step.target}`)
        return
      }

      const rect = element.getBoundingClientRect()
      const tooltipWidth = 400
      const tooltipHeight = 150
      const offset = 20

      let top = rect.top
      let left = rect.left

      switch (step.placement) {
        case "top":
          top = rect.top - tooltipHeight - offset
          left = rect.left + rect.width / 2 - tooltipWidth / 2
          break
        case "bottom":
          top = rect.bottom + offset
          left = rect.left + rect.width / 2 - tooltipWidth / 2
          break
        case "left":
          top = rect.top + rect.height / 2 - tooltipHeight / 2
          left = rect.left - tooltipWidth - offset
          break
        case "right":
          top = rect.top + rect.height / 2 - tooltipHeight / 2
          left = rect.right + offset
          break
        default:
          top = rect.bottom + offset
          left = rect.left + rect.width / 2 - tooltipWidth / 2
      }

      // Keep tooltip within viewport
      top = Math.max(10, Math.min(window.innerHeight - tooltipHeight - 10, top))
      left = Math.max(10, Math.min(window.innerWidth - tooltipWidth - 10, left))

      setPosition({ top, left })
    }

    positionTooltip()
    window.addEventListener("resize", positionTooltip)
    window.addEventListener("scroll", positionTooltip)

    return () => {
      window.removeEventListener("resize", positionTooltip)
      window.removeEventListener("scroll", positionTooltip)
    }
  }, [isRunning, currentStep])

  const handleNext = useCallback(() => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      completeTour()
    }
  }, [currentStep])

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }, [currentStep])

  const handleSkip = useCallback(() => {
    localStorage.setItem("alp-tour-skip", "true")
    setIsRunning(false)
  }, [])

  const completeTour = useCallback(() => {
    localStorage.setItem("alp-tour-completed", "true")
    setIsRunning(false)
    
    // Show keyboard shortcuts after tour
    setTimeout(() => {
      setShowKeyboardHelp(true)
    }, 500)
  }, [setShowKeyboardHelp])

  // Allow manual tour restart
  useEffect(() => {
    const handleRestartTour = () => {
      localStorage.removeItem("alp-tour-completed")
      localStorage.removeItem("alp-tour-skip")
      setCurrentStep(0)
      setIsRunning(true)
    }

    window.addEventListener("restart-tour" as any, handleRestartTour)
    return () => {
      window.removeEventListener("restart-tour" as any, handleRestartTour)
    }
  }, [])

  if (!isRunning) return null

  const step = tourSteps[currentStep]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 z-40" onClick={handleSkip} />
      
      {/* Highlight current element */}
      {step.target !== "body" && (
        <>
          {/* Cut-out overlay with bright border */}
          <div
            className="fixed z-50 pointer-events-none border-4 border-blue-400 rounded-lg"
            style={{
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.8), 0 0 20px rgba(59, 130, 246, 0.8), inset 0 0 20px rgba(59, 130, 246, 0.3)",
              ...(() => {
                const element = document.querySelector(step.target)
                if (!element) return {}
                const rect = element.getBoundingClientRect()
                return {
                  top: rect.top - 8,
                  left: rect.left - 8,
                  width: rect.width + 16,
                  height: rect.height + 16,
                }
              })(),
            }}
          />
          
          {/* Pulsing glow effect */}
          <div
            className="fixed z-45 pointer-events-none rounded-lg animate-pulse"
            style={{
              background: "rgba(59, 130, 246, 0.2)",
              border: "2px solid rgba(59, 130, 246, 0.6)",
              ...(() => {
                const element = document.querySelector(step.target)
                if (!element) return {}
                const rect = element.getBoundingClientRect()
                return {
                  top: rect.top - 12,
                  left: rect.left - 12,
                  width: rect.width + 24,
                  height: rect.height + 24,
                }
              })(),
            }}
          />
        </>
      )}

      {/* Tour tooltip */}
      <Card
        ref={tourRef}
        className="fixed z-50 w-[400px] bg-gray-800 border-gray-600 shadow-xl"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
      >
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-semibold text-white">{step.title}</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <p className="text-gray-300 mb-4">{step.content}</p>
          
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-400">
              {currentStep + 1} of {tourSteps.length}
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={currentStep === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleSkip}
              >
                Skip tour
              </Button>
              
              <Button
                size="sm"
                onClick={handleNext}
              >
                {currentStep === tourSteps.length - 1 ? "Finish" : "Next"}
                {currentStep < tourSteps.length - 1 && (
                  <ChevronRight className="h-4 w-4 ml-1" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}