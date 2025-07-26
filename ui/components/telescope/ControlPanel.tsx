"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TelescopeControls } from "./panels/TelescopeControls"
import { EnvironmentPanel } from "./panels/EnvironmentPanel"
import { LocationPanel } from "./panels/LocationPanel"
import { ImageControls } from "./panels/ImageControls"
import { TabIndicator } from "./TabIndicator"
import { ScrollableTabs } from "./ScrollableTabs"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { Settings, Cloud, BarChart3, MapPin } from "lucide-react"
import { ImagingMetrics } from "./panels/ImagingMetrics"

export function ControlPanel() {
  const {
    tabActivity,
    activeSession: _activeSession,
    selectedTarget: _selectedTarget,
    observationNotes: _observationNotes,
    observationRating: _observationRating,
    equipment,
    maintenanceRecords: _maintenanceRecords,
    showPiP: _showPiP,
    showAnnotations: _showAnnotations,
    isImaging,
    setShowLocationManager,
    currentObservingLocation,
  } = useTelescopeContext()

  // Calculate dynamic indicators based on current state
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getSessionIndicators = () => {
    const indicators = []
    if (_activeSession) {
      indicators.push(<TabIndicator key="active" type="active" />)
    }
    return indicators
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getTargetIndicators = () => {
    const indicators = []
    if (tabActivity.targets.hasRecommendations && tabActivity.targets.count) {
      indicators.push(<TabIndicator key="count" type="count" count={tabActivity.targets.count} />)
    }
    return indicators
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getObservationIndicators = () => {
    const indicators = []
    if (_selectedTarget && (_observationNotes || _observationRating !== 3)) {
      indicators.push(<TabIndicator key="unsaved" type="warning" />)
    }
    return indicators
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getTelescopeIndicators = () => {
    const indicators = []
    return indicators
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getEnvironmentIndicators = () => {
    const indicators = []
    return indicators
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getEquipmentIndicators = () => {
    const indicators = []

    // Count equipment needing maintenance
    const needsMaintenance = equipment.filter((eq) => {
      if (!eq.maintenance.nextMaintenance) return false
      return new Date(eq.maintenance.nextMaintenance) <= new Date()
    }).length

    if (needsMaintenance > 0) {
      indicators.push(<TabIndicator key="maintenance" type="warning" />)
    }

    // Count equipment with issues
    const hasIssues = equipment.filter((eq) => eq.condition === "poor").length
    if (hasIssues > 0) {
      indicators.push(<TabIndicator key="issues" type="count" count={hasIssues} />)
    }

    return indicators
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getPipTestIndicators = () => {
    const indicators = []
    if (_showPiP) {
      indicators.push(<TabIndicator key="active" type="active" />)
    }
    return indicators
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getAnnotationIndicators = () => {
    const indicators = []
    if (_showAnnotations) {
      indicators.push(<TabIndicator key="active" type="active" />)
    }
    return indicators
  }

  return (
    <div className="space-y-4" data-tour="control-panel">
      <Tabs defaultValue={isImaging ? "imaging" : "telescope"} className="w-full">
        <ScrollableTabs className="bg-gray-800 border-gray-700 rounded-md">
          <TabsList className="flex bg-transparent border-0 p-1">
            {/*<TabsTrigger*/}
            {/*  value="session"*/}
            {/*  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"*/}
            {/*>*/}
            {/*  <Camera className="w-4 h-4" />*/}
            {/*  Session*/}
            {/*  {getSessionIndicators()}*/}
            {/*</TabsTrigger>*/}
            {/*<TabsTrigger*/}
            {/*  value="targets"*/}
            {/*  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"*/}
            {/*>*/}
            {/*  <Target className="w-4 h-4" />*/}
            {/*  Targets*/}
            {/*  {getTargetIndicators()}*/}
            {/*</TabsTrigger>*/}
            {/*<TabsTrigger*/}
            {/*  value="observation"*/}
            {/*  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"*/}
            {/*>*/}
            {/*  <BookOpen className="w-4 h-4" />*/}
            {/*  Observation*/}
            {/*  {getObservationIndicators()}*/}
            {/*</TabsTrigger>*/}
            {!isImaging && (
              <>
                <TabsTrigger
                  value="telescope"
                  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"
                  data-tour="telescope-controls-tab"
                >
                  <Settings className="w-4 h-4" />
                  Telescope
                  {getTelescopeIndicators()}
                </TabsTrigger>
                {/*<TabsTrigger*/}
                {/*  value="environment"*/}
                {/*  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"*/}
                {/*  data-tour="environment-tab"*/}
                {/*>*/}
                {/*  <Cloud className="w-4 h-4" />*/}
                {/*  Environment*/}
                {/*  {getEnvironmentIndicators()}*/}
                {/*</TabsTrigger>*/}
                <TabsTrigger
                  value="location"
                  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"
                  data-tour="location-tab"
                >
                  <MapPin className="w-4 h-4" />
                  Location
                  {currentObservingLocation ? <TabIndicator type="active" /> : <TabIndicator type="warning" />}
                </TabsTrigger>
              </>
            )}
            {isImaging && (
              <TabsTrigger
                value="imaging"
                className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"
                data-tour="imaging-metrics-tab"
              >
                <BarChart3 className="w-4 h-4" />
                Quality Metrics
              </TabsTrigger>
            )}
            {/*<TabsTrigger*/}
            {/*  value="equipment"*/}
            {/*  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"*/}
            {/*>*/}
            {/*  <Wrench className="w-4 h-4" />*/}
            {/*  Equipment*/}
            {/*  {getEquipmentIndicators()}*/}
            {/*</TabsTrigger>*/}
            {/*<TabsTrigger*/}
            {/*  value="annotations"*/}
            {/*  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"*/}
            {/*>*/}
            {/*  <MapPin className="w-4 h-4" />*/}
            {/*  Annotations*/}
            {/*  {getAnnotationIndicators()}*/}
            {/*</TabsTrigger>*/}
            {/*<TabsTrigger*/}
            {/*  value="pip-test"*/}
            {/*  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"*/}
            {/*>*/}
            {/*  <TestTube className="w-4 h-4" />*/}
            {/*  PiP Test*/}
            {/*  {getPipTestIndicators()}*/}
            {/*</TabsTrigger>*/}
          </TabsList>
        </ScrollableTabs>

        {/*<TabsContent value="session" className="space-y-4 mt-4">*/}
        {/*  <SessionManagement />*/}
        {/*</TabsContent>*/}

        {/*<TabsContent value="targets" className="space-y-4 mt-4">*/}
        {/*  <TargetSearch />*/}
        {/*  <RecommendedTargets />*/}
        {/*</TabsContent>*/}

        {/*<TabsContent value="observation" className="space-y-4 mt-4">*/}
        {/*  <ObservationLogger />*/}
        {/*</TabsContent>*/}

        {!isImaging && (
          <>
            <TabsContent value="telescope" className="space-y-4 mt-4">
              <TelescopeControls />
              <ImageControls />
            </TabsContent>

            {/*<TabsContent value="environment" className="space-y-4 mt-4">*/}
            {/*  <EnvironmentPanel />*/}
            {/*</TabsContent>*/}

            <TabsContent value="location" className="space-y-4 mt-4">
              <LocationPanel />
            </TabsContent>
          </>
        )}

        {isImaging && (
          <TabsContent value="imaging" className="space-y-4 mt-4">
            <ImagingMetrics />
          </TabsContent>
        )}

        {/*<TabsContent value="equipment" className="space-y-4 mt-4">*/}
        {/*  <EquipmentSelector selectedEquipmentIds={[]} onSelectionChange={() => {}} showCompatibilityCheck={true} />*/}
        {/*</TabsContent>*/}

        {/*<TabsContent value="annotations" className="space-y-4 mt-4">*/}
        {/*  <AnnotationControls />*/}
        {/*</TabsContent>*/}

        {/*<TabsContent value="pip-test" className="space-y-4 mt-4">*/}
        {/*  <PipTestPanel />*/}
        {/*</TabsContent>*/}
      </Tabs>
    </div>
  )
}
