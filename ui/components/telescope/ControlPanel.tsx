"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SessionManagement } from "./panels/SessionManagement"
import { TargetSearch } from "./panels/TargetSearch"
import { ObservationLogger } from "./panels/ObservationLogger"
import { RecommendedTargets } from "./panels/RecommendedTargets"
import { TelescopeControls } from "./panels/TelescopeControls"
import { EnvironmentPanel } from "./panels/EnvironmentPanel"
import { EquipmentSelector } from "./panels/EquipmentSelector"
import { TabIndicator } from "./TabIndicator"
import { ScrollableTabs } from "./ScrollableTabs"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { Camera, Target, BookOpen, Settings, Cloud, Wrench, TestTube, MapPin } from "lucide-react"
import { PipTestPanel } from "./PipTestPanel"
import { AnnotationControls } from "./AnnotationControls"

export function ControlPanel() {
  const {
    tabActivity,
    activeSession,
    selectedTarget,
    observationNotes,
    observationRating,
    equipment,
    maintenanceRecords,
    showPiP,
    showAnnotations,
  } = useTelescopeContext()

  // Calculate dynamic indicators based on current state
  const getSessionIndicators = () => {
    const indicators = []
    if (activeSession) {
      indicators.push(<TabIndicator key="active" type="active" />)
    }
    return indicators
  }

  const getTargetIndicators = () => {
    const indicators = []
    if (tabActivity.targets.hasRecommendations && tabActivity.targets.count) {
      indicators.push(<TabIndicator key="count" type="count" count={tabActivity.targets.count} />)
    }
    return indicators
  }

  const getObservationIndicators = () => {
    const indicators = []
    if (selectedTarget && (observationNotes || observationRating !== 3)) {
      indicators.push(<TabIndicator key="unsaved" type="warning" />)
    }
    return indicators
  }

  const getTelescopeIndicators = () => {
    const indicators = []
    return indicators
  }

  const getEnvironmentIndicators = () => {
    const indicators = []
    return indicators
  }

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

  const getPipTestIndicators = () => {
    const indicators = []
    if (showPiP) {
      indicators.push(<TabIndicator key="active" type="active" />)
    }
    return indicators
  }

  const getAnnotationIndicators = () => {
    const indicators = []
    if (showAnnotations) {
      indicators.push(<TabIndicator key="active" type="active" />)
    }
    return indicators
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="telescope" className="w-full">
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
            <TabsTrigger
              value="telescope"
              className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"
            >
              <Settings className="w-4 h-4" />
              Telescope
              {getTelescopeIndicators()}
            </TabsTrigger>
            <TabsTrigger
              value="environment"
              className="flex items-center gap-2 text-sm whitespace-nowrap px-4 py-2 min-w-fit data-[state=active]:bg-gray-700"
            >
              <Cloud className="w-4 h-4" />
              Environment
              {getEnvironmentIndicators()}
            </TabsTrigger>
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

        <TabsContent value="telescope" className="space-y-4 mt-4">
          <TelescopeControls />
        </TabsContent>

        <TabsContent value="environment" className="space-y-4 mt-4">
          <EnvironmentPanel />
        </TabsContent>

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
