"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Clock, MapPin, Pause, Play, Square } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"
import { formatSessionTime } from "../../../utils/telescope-utils"

export function SessionManagement() {
  const {
    activeSession,
    sessionTimer,
    sessionTimerRef,
    sessionLocation,
    setSessionLocation,
    sessionEquipment,
    setSessionEquipment,
    sessionNotes,
    setSessionNotes,
    currentObservingLocation,
    systemStats,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    pastSessions,
  } = useTelescopeContext()

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Clock className="w-5 h-5" />
          {activeSession ? "Active Session" : "Session Management"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeSession ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 bg-gray-700/50 rounded">
              <div className="text-sm text-gray-300">Duration</div>
              <div className="text-white font-mono text-lg">{formatSessionTime(sessionTimer)}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-300 mb-1 block">Location</label>
                <Input
                  value={sessionLocation}
                  onChange={(e) => setSessionLocation(e.target.value)}
                  placeholder={currentObservingLocation?.name || "Location..."}
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 text-sm h-8"
                />
              </div>
              <div>
                <label className="text-xs text-gray-300 mb-1 block">Equipment</label>
                <Input
                  value={sessionEquipment}
                  onChange={(e) => setSessionEquipment(e.target.value)}
                  placeholder="Equipment..."
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 text-sm h-8"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-300 mb-1 block">Notes</label>
              <Textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Session notes..."
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 resize-none text-sm"
                rows={2}
              />
            </div>

            {systemStats && (
              <div className="text-xs text-gray-400 bg-gray-700/30 rounded p-2">
                <div className="grid grid-cols-2 gap-2">
                  {systemStats.weather && (
                    <>
                      <div>Weather: {systemStats.weather.condition}</div>
                      <div>Seeing: {systemStats.weather.seeingCondition}</div>
                      <div>Humidity: {Math.round(systemStats.weather.humidity)}%</div>
                    </>
                  )}
                  {systemStats.temperature && (
                    <div>Temp: {systemStats.temperature.toFixed(1)}°C</div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {sessionTimerRef.current ? (
                <Button onClick={pauseSession} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white h-8">
                  <Pause className="w-3 h-3 mr-1" />
                  Pause
                </Button>
              ) : (
                <Button onClick={resumeSession} className="flex-1 bg-green-600 hover:bg-green-700 text-white h-8">
                  <Play className="w-3 h-3 mr-1" />
                  Resume
                </Button>
              )}
              <Button onClick={endSession} className="flex-1 bg-red-600 hover:bg-red-700 text-white h-8">
                <Square className="w-3 h-3 mr-1" />
                End
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-300 mb-1 block">Location</label>
              <Input
                value={sessionLocation}
                onChange={(e) => setSessionLocation(e.target.value)}
                placeholder={currentObservingLocation?.name || "Observation location..."}
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 text-sm h-8"
              />
              {currentObservingLocation && (
                <div className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3" />
                  Current: {currentObservingLocation.name}
                  {currentObservingLocation.lightPollution.bortle && (
                    <span>• Bortle {currentObservingLocation.lightPollution.bortle}</span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-gray-300 mb-1 block">Notes</label>
              <Textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Session notes..."
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 resize-none text-sm"
                rows={2}
              />
            </div>

            <Button onClick={startSession} className="w-full bg-green-600 hover:bg-green-700 text-white h-8">
              <Play className="w-3 h-3 mr-1" />
              Start Session
            </Button>

            {pastSessions.length > 0 && (
              <div>
                <div className="text-xs text-gray-300 mb-2">Recent Sessions</div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {pastSessions.slice(0, 3).map((session) => (
                    <div key={session.id} className="bg-gray-700/30 rounded p-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-300">
                          {session.startTime instanceof Date 
                            ? session.startTime.toLocaleDateString()
                            : new Date(session.startTime).toLocaleDateString()}
                        </span>
                        <span className="text-white">
                          {session.endTime
                            ? Math.floor((
                                (session.endTime instanceof Date ? session.endTime : new Date(session.endTime)).getTime() - 
                                (session.startTime instanceof Date ? session.startTime : new Date(session.startTime)).getTime()
                              ) / (1000 * 60))
                            : "?"}{" "}
                          min
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
