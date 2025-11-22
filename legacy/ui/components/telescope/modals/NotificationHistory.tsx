"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { X, History, Bell, Calendar, Cloud, Star, AlertTriangle, Clock, Check, Eye, Trash2 } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"

export function NotificationHistory() {
  const {
    showNotificationHistory,
    setShowNotificationHistory,
    notificationHistory,
    setNotificationHistory,
    scheduledNotifications,
  } = useTelescopeContext()

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

  const clearHistory = () => {
    setNotificationHistory([])
  }

  const markAsRead = (id: string) => {
    setNotificationHistory((prev) =>
      prev.map((notification) => (notification.id === id ? { ...notification, clicked: true } : notification)),
    )
  }

  const deleteNotification = (id: string) => {
    setNotificationHistory((prev) => prev.filter((notification) => notification.id !== id))
  }

  if (!showNotificationHistory) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <History className="w-5 h-5" />
            Notification History
          </h2>
          <div className="flex items-center gap-2">
            {notificationHistory.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearHistory}
                className="border-gray-600 text-white hover:bg-gray-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNotificationHistory(false)}
              className="h-8 w-8 p-0 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Scheduled Notifications */}
          {scheduledNotifications.filter((n) => !n.sent).length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Upcoming Notifications
              </h3>
              <div className="space-y-2">
                {scheduledNotifications
                  .filter((n) => !n.sent)
                  .sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime())
                  .map((notification) => (
                    <div key={notification.id} className="bg-gray-700/50 rounded-md p-3 border-l-4 border-blue-500">
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
                        <Badge variant="outline" className="border-blue-400 text-blue-400">
                          Pending
                        </Badge>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Notification History */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <History className="w-5 h-5" />
              Recent Notifications
              {notificationHistory.filter((n) => !n.clicked && Date.now() - n.timestamp.getTime() < 24 * 60 * 60 * 1000)
                .length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {
                    notificationHistory.filter(
                      (n) => !n.clicked && Date.now() - n.timestamp.getTime() < 24 * 60 * 60 * 1000,
                    ).length
                  }{" "}
                  unread
                </Badge>
              )}
            </h3>
            <div className="space-y-2">
              {notificationHistory.length > 0 ? (
                notificationHistory
                  .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                  .map((notification) => (
                    <div
                      key={notification.id}
                      className={`bg-gray-700/50 rounded-md p-3 transition-all hover:bg-gray-700/70 ${
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
                            <span>{notification.timestamp.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {notification.clicked ? (
                            <Badge variant="outline" className="border-green-400 text-green-400">
                              <Check className="w-3 h-3 mr-1" />
                              Read
                            </Badge>
                          ) : notification.dismissed ? (
                            <Badge variant="outline" className="border-gray-500 text-gray-500">
                              <Eye className="w-3 h-3 mr-1" />
                              Dismissed
                            </Badge>
                          ) : (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => markAsRead(notification.id)}
                                className="h-6 w-6 p-0 text-green-400 hover:text-green-300"
                                title="Mark as read"
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteNotification(notification.id)}
                                className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="text-gray-400 text-center py-8">
                  <Bell className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No notifications yet</h3>
                  <p className="text-gray-400">
                    Notifications will appear here when you receive alerts about sessions, weather, or celestial events.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Statistics */}
          {notificationHistory.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-700">
              <h4 className="font-medium text-white mb-3">Statistics</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="bg-gray-700/50 rounded-md p-3 text-center">
                  <div className="text-2xl font-bold text-blue-400">{notificationHistory.length}</div>
                  <div className="text-xs text-gray-400">Total</div>
                </div>
                <div className="bg-gray-700/50 rounded-md p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {notificationHistory.filter((n) => n.clicked).length}
                  </div>
                  <div className="text-xs text-gray-400">Read</div>
                </div>
                <div className="bg-gray-700/50 rounded-md p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-400">
                    {notificationHistory.filter((n) => !n.clicked && !n.dismissed).length}
                  </div>
                  <div className="text-xs text-gray-400">Unread</div>
                </div>
                <div className="bg-gray-700/50 rounded-md p-3 text-center">
                  <div className="text-2xl font-bold text-gray-400">
                    {notificationHistory.filter((n) => n.dismissed).length}
                  </div>
                  <div className="text-xs text-gray-400">Dismissed</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
