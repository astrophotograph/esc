"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { X, Calendar, Plus, ChevronLeft, ChevronRight, Clock, MapPin, CheckCircle, Target } from "lucide-react"
import { useState } from "react"
import { useTelescopeContext } from "../../../context/TelescopeContext"
import { getWeatherIcon, getEventTypeIcon } from "../../../utils/telescope-utils"

export function PlanningPanel() {
  const {
    showPlanningPanel,
    setShowPlanningPanel,
    planningView,
    setPlanningView,
    selectedDate,
    setSelectedDate,
    newSessionTitle,
    setNewSessionTitle,
    newSessionStartTime,
    setNewSessionStartTime,
    newSessionEndTime,
    setNewSessionEndTime,
    newSessionLocation,
    setNewSessionLocation,
    newSessionNotes,
    setNewSessionNotes,
    newSessionPriority,
    setNewSessionPriority,
    plannedSessions,
    setPlannedSessions,
    celestialEvents,
    weatherForecast,
    currentObservingLocation,
    createPlannedSession,
  } = useTelescopeContext()

  const [currentMonth, setCurrentMonth] = useState(new Date())

  if (!showPlanningPanel) return null

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days = []

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day))
    }

    return days
  }

  const navigateMonth = (direction: "prev" | "next") => {
    const newMonth = new Date(currentMonth)
    if (direction === "prev") {
      newMonth.setMonth(newMonth.getMonth() - 1)
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1)
    }
    setCurrentMonth(newMonth)
  }

  const getSessionsForDate = (date: Date) => {
    return plannedSessions.filter((session) => session.date.toDateString() === date.toDateString())
  }

  const getEventsForDate = (date: Date) => {
    return celestialEvents.filter((event) => Math.abs(event.date.getTime() - date.getTime()) < 24 * 60 * 60 * 1000)
  }

  const getWeatherForDate = (date: Date) => {
    return weatherForecast.find((forecast) => forecast.date.toDateString() === date.toDateString())
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isSelected = (date: Date) => {
    return date.toDateString() === selectedDate.toDateString()
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg max-w-6xl w-full h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Session Planning
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-700 rounded-lg p-1">
              <Button
                variant={planningView === "calendar" ? "default" : "ghost"}
                size="sm"
                onClick={() => setPlanningView("calendar")}
                className={planningView === "calendar" ? "bg-blue-600 text-white" : "text-gray-300"}
              >
                Calendar
              </Button>
              <Button
                variant={planningView === "events" ? "default" : "ghost"}
                size="sm"
                onClick={() => setPlanningView("events")}
                className={planningView === "events" ? "bg-blue-600 text-white" : "text-gray-300"}
              >
                Events
              </Button>
              <Button
                variant={planningView === "weather" ? "default" : "ghost"}
                size="sm"
                onClick={() => setPlanningView("weather")}
                className={planningView === "weather" ? "bg-blue-600 text-white" : "text-gray-300"}
              >
                Weather
              </Button>
              <Button
                variant={planningView === "create" ? "default" : "ghost"}
                size="sm"
                onClick={() => setPlanningView("create")}
                className={planningView === "create" ? "bg-blue-600 text-white" : "text-gray-300"}
              >
                Create
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPlanningPanel(false)}
              className="h-8 w-8 p-0 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {planningView === "calendar" && (
            <div className="space-y-6">
              {/* Calendar Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                  {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateMonth("prev")}
                    className="border-gray-600 text-white hover:bg-gray-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCurrentMonth(new Date())
                      setSelectedDate(new Date())
                    }}
                    className="border-gray-600 text-white hover:bg-gray-700"
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateMonth("next")}
                    className="border-gray-600 text-white hover:bg-gray-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-2">
                {/* Day headers */}
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-gray-400 p-2">
                    {day}
                  </div>
                ))}

                {/* Calendar days */}
                {getDaysInMonth(currentMonth).map((date, index) => {
                  if (!date) {
                    return <div key={index} className="p-2"></div>
                  }

                  const sessions = getSessionsForDate(date)
                  const events = getEventsForDate(date)
                  const weather = getWeatherForDate(date)

                  return (
                    <div
                      key={date.toISOString()}
                      className={`p-2 min-h-[80px] border rounded-lg cursor-pointer transition-colors ${
                        isSelected(date)
                          ? "border-blue-500 bg-blue-900/20"
                          : isToday(date)
                            ? "border-green-500 bg-green-900/20"
                            : "border-gray-600 hover:border-gray-500 hover:bg-gray-700/50"
                      }`}
                      onClick={() => setSelectedDate(date)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-medium ${isToday(date) ? "text-green-400" : "text-white"}`}>
                          {date.getDate()}
                        </span>
                        {weather && (
                          <div className="flex items-center gap-1">
                            {getWeatherIcon(weather.condition)}
                            <span className="text-xs text-gray-400">{Math.round(weather.observingScore)}%</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        {sessions.map((session) => (
                          <div
                            key={session.id}
                            className={`text-xs p-1 rounded truncate ${
                              session.priority === "high"
                                ? "bg-red-600/20 text-red-300"
                                : session.priority === "medium"
                                  ? "bg-yellow-600/20 text-yellow-300"
                                  : "bg-blue-600/20 text-blue-300"
                            }`}
                          >
                            {session.title}
                          </div>
                        ))}

                        {events.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            className="text-xs p-1 bg-purple-600/20 text-purple-300 rounded truncate flex items-center gap-1"
                          >
                            {getEventTypeIcon(event.type)}
                            <span>{event.name}</span>
                          </div>
                        ))}

                        {events.length > 2 && <div className="text-xs text-gray-400">+{events.length - 2} more</div>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Selected Date Details */}
              {selectedDate && (
                <Card className="bg-gray-700 border-gray-600">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">
                      {selectedDate.toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Planned Sessions */}
                    <div>
                      <h4 className="font-medium text-white mb-2">Planned Sessions</h4>
                      {getSessionsForDate(selectedDate).length > 0 ? (
                        <div className="space-y-2">
                          {getSessionsForDate(selectedDate).map((session) => (
                            <div key={session.id} className="bg-gray-600 rounded-md p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-white">{session.title}</span>
                                <Badge
                                  variant={
                                    session.priority === "high"
                                      ? "destructive"
                                      : session.priority === "medium"
                                        ? "default"
                                        : "secondary"
                                  }
                                >
                                  {session.priority}
                                </Badge>
                              </div>
                              <div className="text-sm text-gray-300 space-y-1">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3 h-3" />
                                  {session.startTime} - {session.endTime}
                                </div>
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-3 h-3" />
                                  {session.location}
                                </div>
                                {session.notes && <div className="text-xs text-gray-400 mt-2">{session.notes}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-gray-400 text-sm">No sessions planned</div>
                      )}
                    </div>

                    {/* Celestial Events */}
                    <div>
                      <h4 className="font-medium text-white mb-2">Celestial Events</h4>
                      {getEventsForDate(selectedDate).length > 0 ? (
                        <div className="space-y-2">
                          {getEventsForDate(selectedDate).map((event) => (
                            <div key={event.id} className="bg-purple-900/20 border border-purple-600/30 rounded-md p-3">
                              <div className="flex items-center gap-2 mb-1">
                                {getEventTypeIcon(event.type)}
                                <span className="font-medium text-white">{event.name}</span>
                                <Badge variant="outline" className="border-purple-400 text-purple-400">
                                  {event.visibility}
                                </Badge>
                              </div>
                              <div className="text-sm text-gray-300">{event.description}</div>
                              <div className="text-xs text-gray-400 mt-1">Best viewing: {event.bestViewingTime}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-gray-400 text-sm">No special events</div>
                      )}
                    </div>

                    {/* Weather Forecast */}
                    <div>
                      <h4 className="font-medium text-white mb-2">Weather Forecast</h4>
                      {getWeatherForDate(selectedDate) ? (
                        <div className="bg-gray-600 rounded-md p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getWeatherIcon(getWeatherForDate(selectedDate)!.condition)}
                              <span className="text-white capitalize">
                                {getWeatherForDate(selectedDate)!.condition.replace("_", " ")}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-medium">
                                {Math.round(getWeatherForDate(selectedDate)!.observingScore)}% Score
                              </div>
                              <div className="text-xs text-gray-400">
                                {getWeatherForDate(selectedDate)!.seeingForecast} seeing
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <div className="text-gray-400">Temperature</div>
                              <div className="text-white">
                                {Math.round(getWeatherForDate(selectedDate)!.temperature.low)}° -{" "}
                                {Math.round(getWeatherForDate(selectedDate)!.temperature.high)}°C
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-400">Cloud Cover</div>
                              <div className="text-white">
                                {Math.round(getWeatherForDate(selectedDate)!.cloudCover)}%
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-400">Wind</div>
                              <div className="text-white">
                                {getWeatherForDate(selectedDate)!.windSpeed.toFixed(1)} m/s
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-400 text-sm">No forecast available</div>
                      )}
                    </div>

                    <Button onClick={() => setPlanningView("create")} className="w-full bg-blue-600 hover:bg-blue-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Plan Session for This Date
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {planningView === "events" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Upcoming Celestial Events</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {celestialEvents
                  .filter((event) => event.date >= new Date())
                  .sort((a, b) => a.date.getTime() - b.date.getTime())
                  .slice(0, 10)
                  .map((event) => (
                    <Card key={event.id} className="bg-gray-700 border-gray-600">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          {getEventTypeIcon(event.type)}
                          <span className="font-medium text-white">{event.name}</span>
                          <Badge variant="outline" className="border-purple-400 text-purple-400">
                            {event.visibility}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-300 mb-2">{event.description}</div>
                        <div className="text-xs text-gray-400 space-y-1">
                          <div>Date: {event.date.toLocaleDateString()}</div>
                          <div>Best viewing: {event.bestViewingTime}</div>
                          {event.duration && <div>Duration: {event.duration}</div>}
                          {event.magnitude && <div>Magnitude: {event.magnitude}</div>}
                          {event.constellation && <div>Constellation: {event.constellation}</div>}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedDate(event.date)
                            setPlanningView("create")
                          }}
                          className="w-full mt-3 bg-purple-600 hover:bg-purple-700"
                        >
                          Plan Session
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          )}

          {planningView === "weather" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">14-Day Weather Forecast</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {weatherForecast.map((forecast, index) => (
                  <Card key={index} className="bg-gray-700 border-gray-600">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-medium text-white">
                            {forecast.date.toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          <div className="text-xs text-gray-400">
                            {index === 0 ? "Today" : index === 1 ? "Tomorrow" : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 mb-1">
                            {getWeatherIcon(forecast.condition)}
                            <span className="text-sm text-white capitalize">
                              {forecast.condition.replace("_", " ")}
                            </span>
                          </div>
                          <div
                            className={`text-lg font-bold ${
                              forecast.observingScore >= 70
                                ? "text-green-400"
                                : forecast.observingScore >= 40
                                  ? "text-yellow-400"
                                  : "text-red-400"
                            }`}
                          >
                            {Math.round(forecast.observingScore)}%
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-gray-400">Temperature</div>
                          <div className="text-white">
                            {Math.round(forecast.temperature.low)}° - {Math.round(forecast.temperature.high)}°C
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Seeing</div>
                          <div className="text-white capitalize">{forecast.seeingForecast}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Cloud Cover</div>
                          <div className="text-white">{Math.round(forecast.cloudCover)}%</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Wind</div>
                          <div className="text-white">{forecast.windSpeed.toFixed(1)} m/s</div>
                        </div>
                      </div>

                      {forecast.observingScore >= 60 && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedDate(forecast.date)
                            setPlanningView("create")
                          }}
                          className="w-full mt-3 bg-green-600 hover:bg-green-700"
                        >
                          <Target className="w-3 h-3 mr-1" />
                          Plan Session
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {planningView === "create" && (
            <div className="max-w-2xl mx-auto space-y-6">
              <h3 className="text-lg font-semibold text-white">Create New Session</h3>

              <Card className="bg-gray-700 border-gray-600">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <label className="text-sm text-gray-300 mb-2 block">Session Title *</label>
                    <Input
                      value={newSessionTitle}
                      onChange={(e) => setNewSessionTitle(e.target.value)}
                      placeholder="e.g., Deep Sky Photography Session"
                      className="bg-gray-600 border-gray-500 text-white placeholder-gray-400"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-300 mb-2 block">Date</label>
                    <Input
                      type="date"
                      value={selectedDate.toISOString().split("T")[0]}
                      onChange={(e) => setSelectedDate(new Date(e.target.value))}
                      className="bg-gray-600 border-gray-500 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-300 mb-2 block">Start Time</label>
                      <Input
                        type="time"
                        value={newSessionStartTime}
                        onChange={(e) => setNewSessionStartTime(e.target.value)}
                        className="bg-gray-600 border-gray-500 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-300 mb-2 block">End Time</label>
                      <Input
                        type="time"
                        value={newSessionEndTime}
                        onChange={(e) => setNewSessionEndTime(e.target.value)}
                        className="bg-gray-600 border-gray-500 text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-gray-300 mb-2 block">Location</label>
                    <Input
                      value={newSessionLocation}
                      onChange={(e) => setNewSessionLocation(e.target.value)}
                      placeholder={currentObservingLocation?.name || "Observation location..."}
                      className="bg-gray-600 border-gray-500 text-white placeholder-gray-400"
                    />
                    {currentObservingLocation && (
                      <div className="text-xs text-gray-400 mt-1">
                        Current location: {currentObservingLocation.name}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-sm text-gray-300 mb-2 block">Priority</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["low", "medium", "high"] as const).map((priority) => (
                        <Button
                          key={priority}
                          variant={newSessionPriority === priority ? "default" : "outline"}
                          size="sm"
                          onClick={() => setNewSessionPriority(priority)}
                          className={`capitalize ${
                            newSessionPriority === priority
                              ? priority === "high"
                                ? "bg-red-600 hover:bg-red-700"
                                : priority === "medium"
                                  ? "bg-yellow-600 hover:bg-yellow-700"
                                  : "bg-blue-600 hover:bg-blue-700"
                              : "border-gray-600 text-white hover:bg-gray-700"
                          }`}
                        >
                          {priority}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-gray-300 mb-2 block">Notes</label>
                    <Textarea
                      value={newSessionNotes}
                      onChange={(e) => setNewSessionNotes(e.target.value)}
                      placeholder="Add session notes, targets, equipment requirements..."
                      className="bg-gray-600 border-gray-500 text-white placeholder-gray-400 resize-none"
                      rows={4}
                    />
                  </div>

                  {/* Session Preview */}
                  <div className="bg-gray-600 rounded-md p-4">
                    <h4 className="font-medium text-white mb-2">Session Preview</h4>
                    <div className="text-sm text-gray-300 space-y-1">
                      <div>
                        <strong>Date:</strong>{" "}
                        {selectedDate.toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </div>
                      <div>
                        <strong>Time:</strong> {newSessionStartTime} - {newSessionEndTime}
                      </div>
                      <div>
                        <strong>Duration:</strong> {(() => {
                          const start = new Date(`2000-01-01T${newSessionStartTime}`)
                          const end = new Date(`2000-01-01T${newSessionEndTime}`)
                          const diff = end.getTime() - start.getTime()
                          const hours = Math.floor(diff / (1000 * 60 * 60))
                          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
                          return `${hours}h ${minutes}m`
                        })()}
                      </div>

                      {/* Weather for selected date */}
                      {getWeatherForDate(selectedDate) && (
                        <div className="mt-2 p-2 bg-gray-700 rounded">
                          <div className="flex items-center justify-between">
                            <span>
                              <strong>Weather:</strong> {getWeatherForDate(selectedDate)!.condition.replace("_", " ")}
                            </span>
                            <span
                              className={`font-medium ${
                                getWeatherForDate(selectedDate)!.observingScore >= 70
                                  ? "text-green-400"
                                  : getWeatherForDate(selectedDate)!.observingScore >= 40
                                    ? "text-yellow-400"
                                    : "text-red-400"
                              }`}
                            >
                              {Math.round(getWeatherForDate(selectedDate)!.observingScore)}% Score
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Events for selected date */}
                      {getEventsForDate(selectedDate).length > 0 && (
                        <div className="mt-2 p-2 bg-purple-900/20 rounded">
                          <div>
                            <strong>Celestial Events:</strong>
                          </div>
                          {getEventsForDate(selectedDate).map((event) => (
                            <div key={event.id} className="text-xs text-purple-300 ml-2">
                              • {event.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button
                      onClick={createPlannedSession}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      disabled={!newSessionTitle.trim()}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Create Session
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPlanningView("calendar")}
                      className="flex-1 border-gray-600 text-white hover:bg-gray-700"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
