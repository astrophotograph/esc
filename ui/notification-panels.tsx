"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import {
  X,
  Bell,
  BellOff,
  Clock,
  Cloud,
  Star,
  AlertTriangle,
  Battery,
  HardDrive,
  Moon,
  Zap,
  Calendar,
  History,
  Check,
  Eye,
} from "lucide-react"

interface NotificationPanelsProps {
  showNotificationSettings: boolean
  setShowNotificationSettings: (show: boolean) => void
  showNotificationHistory: boolean
  setShowNotificationHistory: (show: boolean) => void
  notificationPermission: NotificationPermission
  notificationSettings: any
  setNotificationSettings: (settings: any) => void
  notificationHistory: any[]
  scheduledNotifications: any[]
  requestNotificationPermission: () => Promise<boolean>
}

export function NotificationPanels({
  showNotificationSettings,
  setShowNotificationSettings,
  showNotificationHistory,
  setShowNotificationHistory,
  notificationPermission,
  notificationSettings,
  setNotificationSettings,
  notificationHistory,
  scheduledNotifications,
  requestNotificationPermission,
}: NotificationPanelsProps) {
  const getNotificationTypeIcon = (type: string) => {
    switch (type) {
      case "session":
        return <Calendar className="w-4 h-4 text-blue-400" />
      case "weather":
        return <Cloud className="w-4 h-4 text-green-400" />
      case "event":
        return <Star className="w-4 h-4 text-yellow-400" />
      case "system":
        return <AlertTriangle className="w-4 h-4 text-red-400" />
      default:
        return <Bell className="w-4 h-4 text-gray-400" />
    }
  }

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  return (
    <>
      {/* Notification Settings Panel */}
      {showNotificationSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notification Settings
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNotificationSettings(false)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Permission Status */}
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    {notificationPermission === "granted" ? (
                      <Bell className="w-4 h-4 text-green-400" />
                    ) : (
                      <BellOff className="w-4 h-4 text-red-400" />
                    )}
                    Notification Permission
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Browser Notifications</span>
                    <Badge
                      variant={
                        notificationPermission === "granted"
                          ? "default"
                          : notificationPermission === "denied"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {notificationPermission === "granted"
                        ? "Enabled"
                        : notificationPermission === "denied"
                          ? "Blocked"
                          : "Not Set"}
                    </Badge>
                  </div>
                  {notificationPermission !== "granted" && (
                    <Button
                      onClick={requestNotificationPermission}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      disabled={notificationPermission === "denied"}
                    >
                      {notificationPermission === "denied" ? "Enable in Browser Settings" : "Enable Notifications"}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Master Toggle */}
              <Card className="bg-gray-700 border-gray-600">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">Enable All Notifications</div>
                      <div className="text-sm text-gray-400">Master switch for all notification types</div>
                    </div>
                    <Switch
                      checked={notificationSettings.enabled}
                      onCheckedChange={(enabled) => setNotificationSettings({ ...notificationSettings, enabled })}
                      disabled={notificationPermission !== "granted"}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Session Reminders */}
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    Session Reminders
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Enable session reminders</span>
                    <Switch
                      checked={notificationSettings.sessionReminders.enabled}
                      onCheckedChange={(enabled) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          sessionReminders: { ...notificationSettings.sessionReminders, enabled },
                        })
                      }
                      disabled={!notificationSettings.enabled}
                    />
                  </div>
                  {notificationSettings.sessionReminders.enabled && (
                    <div className="space-y-2">
                      <label className="text-sm text-gray-300">Remind me before session starts</label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[notificationSettings.sessionReminders.advanceTime]}
                          onValueChange={([value]) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              sessionReminders: { ...notificationSettings.sessionReminders, advanceTime: value },
                            })
                          }
                          min={5}
                          max={120}
                          step={5}
                          className="flex-1"
                        />
                        <span className="text-sm text-white w-16">
                          {notificationSettings.sessionReminders.advanceTime} min
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Weather Alerts */}
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-green-400" />
                    Weather Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Enable weather alerts</span>
                    <Switch
                      checked={notificationSettings.weatherAlerts.enabled}
                      onCheckedChange={(enabled) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          weatherAlerts: { ...notificationSettings.weatherAlerts, enabled },
                        })
                      }
                      disabled={!notificationSettings.enabled}
                    />
                  </div>
                  {notificationSettings.weatherAlerts.enabled && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">Good conditions alert</span>
                        <Switch
                          checked={notificationSettings.weatherAlerts.goodConditions}
                          onCheckedChange={(goodConditions) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              weatherAlerts: { ...notificationSettings.weatherAlerts, goodConditions },
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">Bad conditions alert</span>
                        <Switch
                          checked={notificationSettings.weatherAlerts.badConditions}
                          onCheckedChange={(badConditions) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              weatherAlerts: { ...notificationSettings.weatherAlerts, badConditions },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-gray-300">Observing score threshold</label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[notificationSettings.weatherAlerts.threshold]}
                            onValueChange={([value]) =>
                              setNotificationSettings({
                                ...notificationSettings,
                                weatherAlerts: { ...notificationSettings.weatherAlerts, threshold: value },
                              })
                            }
                            min={30}
                            max={90}
                            step={5}
                            className="flex-1"
                          />
                          <span className="text-sm text-white w-12">
                            {notificationSettings.weatherAlerts.threshold}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Celestial Events */}
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    Celestial Events
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Enable event notifications</span>
                    <Switch
                      checked={notificationSettings.celestialEvents.enabled}
                      onCheckedChange={(enabled) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          celestialEvents: { ...notificationSettings.celestialEvents, enabled },
                        })
                      }
                      disabled={!notificationSettings.enabled}
                    />
                  </div>
                  {notificationSettings.celestialEvents.enabled && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-sm text-gray-300">Notify before event</label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[notificationSettings.celestialEvents.advanceTime]}
                            onValueChange={([value]) =>
                              setNotificationSettings({
                                ...notificationSettings,
                                celestialEvents: { ...notificationSettings.celestialEvents, advanceTime: value },
                              })
                            }
                            min={1}
                            max={24}
                            step={1}
                            className="flex-1"
                          />
                          <span className="text-sm text-white w-12">
                            {notificationSettings.celestialEvents.advanceTime}h
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-gray-300">Event types to notify about</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { type: "moon_phase", label: "Moon Phases", icon: <Moon className="w-3 h-3" /> },
                            {
                              type: "planet_opposition",
                              label: "Planet Opposition",
                              icon: <div className="w-3 h-3 rounded-full bg-orange-400"></div>,
                            },
                            { type: "meteor_shower", label: "Meteor Showers", icon: <Zap className="w-3 h-3" /> },
                            {
                              type: "eclipse",
                              label: "Eclipses",
                              icon: <div className="w-3 h-3 rounded-full bg-red-400"></div>,
                            },
                          ].map(({ type, label, icon }) => (
                            <div key={type} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={type}
                                checked={notificationSettings.celestialEvents.eventTypes.includes(type)}
                                onChange={(e) => {
                                  const eventTypes = e.target.checked
                                    ? [...notificationSettings.celestialEvents.eventTypes, type]
                                    : notificationSettings.celestialEvents.eventTypes.filter((t) => t !== type)
                                  setNotificationSettings({
                                    ...notificationSettings,
                                    celestialEvents: { ...notificationSettings.celestialEvents, eventTypes },
                                  })
                                }}
                                className="rounded"
                              />
                              <label
                                htmlFor={type}
                                className="text-xs text-gray-300 flex items-center gap-1 cursor-pointer"
                              >
                                {icon}
                                {label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* System Alerts */}
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    System Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Enable system alerts</span>
                    <Switch
                      checked={notificationSettings.systemAlerts.enabled}
                      onCheckedChange={(enabled) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          systemAlerts: { ...notificationSettings.systemAlerts, enabled },
                        })
                      }
                      disabled={!notificationSettings.enabled}
                    />
                  </div>
                  {notificationSettings.systemAlerts.enabled && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300 flex items-center gap-2">
                          <Battery className="w-3 h-3" />
                          Low battery warnings
                        </span>
                        <Switch
                          checked={notificationSettings.systemAlerts.batteryLow}
                          onCheckedChange={(batteryLow) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              systemAlerts: { ...notificationSettings.systemAlerts, batteryLow },
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300 flex items-center gap-2">
                          <HardDrive className="w-3 h-3" />
                          Storage full warnings
                        </span>
                        <Switch
                          checked={notificationSettings.systemAlerts.storageHigh}
                          onCheckedChange={(storageHigh) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              systemAlerts: { ...notificationSettings.systemAlerts, storageHigh },
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quiet Hours */}
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-400" />
                    Quiet Hours
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Enable quiet hours</span>
                    <Switch
                      checked={notificationSettings.quietHours.enabled}
                      onCheckedChange={(enabled) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          quietHours: { ...notificationSettings.quietHours, enabled },
                        })
                      }
                      disabled={!notificationSettings.enabled}
                    />
                  </div>
                  {notificationSettings.quietHours.enabled && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Start time</label>
                        <Input
                          type="time"
                          value={notificationSettings.quietHours.startTime}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              quietHours: { ...notificationSettings.quietHours, startTime: e.target.value },
                            })
                          }
                          className="bg-gray-600 border-gray-500 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">End time</label>
                        <Input
                          type="time"
                          value={notificationSettings.quietHours.endTime}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              quietHours: { ...notificationSettings.quietHours, endTime: e.target.value },
                            })
                          }
                          className="bg-gray-600 border-gray-500 text-white"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Notification History Panel */}
      {showNotificationHistory && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <History className="w-5 h-5" />
                Notification History
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNotificationHistory(false)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Scheduled Notifications */}
              {scheduledNotifications.filter((n) => !n.sent).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3">Upcoming Notifications</h3>
                  <div className="space-y-2">
                    {scheduledNotifications
                      .filter((n) => !n.sent)
                      .sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime())
                      .map((notification) => (
                        <div key={notification.id} className="bg-gray-700/50 rounded-md p-3">
                          <div className="flex items-start gap-3">
                            {getNotificationTypeIcon(notification.type)}
                            <div className="flex-1">
                              <div className="font-medium text-white text-sm">{notification.title}</div>
                              <div className="text-xs text-gray-300 mt-1">{notification.message}</div>
                              <div className="text-xs text-gray-400 mt-2 flex items-center gap-2">
                                <Clock className="w-3 h-3" />
                                Scheduled for {notification.scheduledTime.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Notification History */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Recent Notifications</h3>
                <div className="space-y-2">
                  {notificationHistory.length > 0 ? (
                    notificationHistory.map((notification) => (
                      <div
                        key={notification.id}
                        className={`bg-gray-700/50 rounded-md p-3 ${
                          !notification.clicked ? "border-l-4 border-blue-500" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {getNotificationTypeIcon(notification.type)}
                          <div className="flex-1">
                            <div className="font-medium text-white text-sm">{notification.title}</div>
                            <div className="text-xs text-gray-300 mt-1">{notification.message}</div>
                            <div className="text-xs text-gray-400 mt-2 flex items-center gap-4">
                              <span>{formatTimeAgo(notification.timestamp)}</span>
                              {notification.clicked && (
                                <span className="flex items-center gap-1 text-green-400">
                                  <Check className="w-3 h-3" />
                                  Clicked
                                </span>
                              )}
                              {notification.dismissed && !notification.clicked && (
                                <span className="flex items-center gap-1 text-gray-500">
                                  <Eye className="w-3 h-3" />
                                  Dismissed
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-400 text-center py-8">No notifications yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
