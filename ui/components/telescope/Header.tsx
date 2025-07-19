"use client"

import { useState } from "react"
import { Bell, Camera, CogIcon as Cog6Tooth, LogOut, User, Mountain, MessageSquare, HelpCircle, ImageIcon, Shield, Star } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTelescope } from "@/components/telescope/TelescopeProvider"
import { useTelescopeContext } from "../../context/TelescopeContext"
import {useTheme} from "next-themes"
import { TelescopeSelector } from "@/components/telescope/TelescopeSelector"
import { useRouter } from "next/navigation"
import { SystemAdminDialog } from "./modals/SystemAdminDialog"

export function Header() {
  const router = useRouter()
  const { theme: _theme, setTheme: _setTheme } = useTheme()
  const { showPiP, setShowPiP } = useTelescope()
  const { handleSceneryMode, setShowDocumentation, setShowConfiguration } = useTelescopeContext()

  const [sceneryMode, setSceneryMode] = useState(false)
  const [showSystemAdmin, setShowSystemAdmin] = useState(false)

  const handleSceneryToggle = async () => {
    const newSceneryMode = !sceneryMode
    setSceneryMode(newSceneryMode)

    // Send scenery mode command through context
    try {
      console.log('Sending scenery mode message:', { mode: "scenery" })
      await handleSceneryMode()
      console.log('Scenery mode message sent successfully')
    } catch (error) {
      console.error('Failed to send scenery mode message:', error)
      // Revert the state if sending failed
      setSceneryMode(!newSceneryMode)
    }
  }

  return (
    <div className="border-b">
      <div className="flex h-16 items-center px-4">
        <TelescopeSelector />
        <div className="ml-auto flex items-center space-x-4">
          {/* Notification Bell */}
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            data-tour="notification-bell"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
              3
            </span>
          </Button>
          {/*<Button*/}
          {/*  variant="outline"*/}
          {/*  size="sm"*/}
          {/*  onClick={() => setShowKeyboard(!showKeyboard)}*/}
          {/*  className="flex items-center gap-2"*/}
          {/*  title="Toggle On-Screen Keyboard (Ctrl+K)"*/}
          {/*>*/}
          {/*  <Keyboard className="w-4 h-4" />*/}
          {/*  Keyboard*/}
          {/*</Button>*/}

          {/* Picture-in-Picture Test Button */}
          <Button
            variant={showPiP ? "default" : "outline"}
            size="sm"
            onClick={() => setShowPiP(!showPiP)}
            className="flex items-center gap-2"
            title="Toggle Picture-in-Picture View (Ctrl+I)"
            data-tour="pip-toggle"
          >
            <Camera className="w-4 h-4" />
            PiP
          </Button>

          {/* Scenery Mode Button */}
          <Button
            variant={sceneryMode ? "default" : "outline"}
            size="sm"
            onClick={handleSceneryToggle}
            className="flex items-center gap-2"
            title="Toggle Scenery Mode"
            data-tour="scenery-mode"
          >
            <Mountain className="w-4 h-4" />
            Scenery
          </Button>

          {/* Image Processing Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/processing')}
            className="flex items-center gap-2"
            title="Image Processing"
          >
            <ImageIcon className="w-4 h-4" />
            Processing
          </Button>

          {/* Sky Map Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/skymap')}
            className="flex items-center gap-2"
            title="Interactive Sky Map"
          >
            <Star className="w-4 h-4" />
            Sky Map
          </Button>

          {/* Messages Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/messages')}
            className="flex items-center gap-2"
            title="View Telescope Messages"
          >
            <MessageSquare className="w-4 h-4" />
            Messages
          </Button>

          {/* Help/Documentation Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDocumentation(true)}
            className="flex items-center gap-2"
            title="Open Documentation (F1)"
          >
            <HelpCircle className="w-4 h-4" />
            Help
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full" data-tour="user-menu">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="/avatars/01.png" alt="Avatar" />
                  <AvatarFallback>OM</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" forceMount>
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                  <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Bell className="mr-2 h-4 w-4" />
                  <span>Notifications</span>
                  <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowConfiguration(true)}>
                  <Cog6Tooth className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                  <DropdownMenuShortcut>F10</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  window.dispatchEvent(new CustomEvent('restart-tour'))
                }}>
                  <HelpCircle className="mr-2 h-4 w-4" />
                  <span>Start Tour</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowSystemAdmin(true)}>
                <Shield className="mr-2 h-4 w-4" />
                <span>System Admin</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
                <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {/* System Admin Dialog */}
      <SystemAdminDialog 
        open={showSystemAdmin} 
        onOpenChange={setShowSystemAdmin} 
      />
    </div>
  )
}
