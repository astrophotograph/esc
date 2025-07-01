"use client"

import { Bell, Camera, CogIcon as Cog6Tooth, LogOut, User } from "lucide-react"
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
import {useTheme} from "next-themes"
import { TelescopeSelector } from "@/components/telescope/TelescopeSelector"

export function Header() {
  const { theme: _theme, setTheme: _setTheme } = useTheme()
  const { showPiP, setShowPiP } = useTelescope()

  return (
    <div className="border-b">
      <div className="flex h-16 items-center px-4">
        <TelescopeSelector />
        <div className="ml-auto flex items-center space-x-4">
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
          >
            <Camera className="w-4 h-4" />
            PiP
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
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
                <DropdownMenuItem>
                  <Cog6Tooth className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                  <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuGroup>
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
    </div>
  )
}
