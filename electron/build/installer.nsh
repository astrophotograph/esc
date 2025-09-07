; Minimal custom NSIS script for ESC installer
; Removes all process detection to avoid false positives during installation

!macro customHeader
  ; Nothing needed
!macroend

!macro preInit
  ; Nothing needed
!macroend

!macro customInit
  ; Nothing needed
!macroend

!macro customInstall
  ; Create necessary directories
  CreateDirectory "$INSTDIR\logs"
  CreateDirectory "$INSTDIR\config"
!macroend

!macro customInstallMode
  ; Let electron-builder handle installation mode
!macroend

!macro customUnInit
  ; Nothing needed for uninstaller init
!macroend

!macro customUnInstall
  ; Clean up user data if requested
  MessageBox MB_YESNO "Do you want to remove log files and user data?" IDNO +3
  RMDir /r "$INSTDIR\logs"
  RMDir /r "$APPDATA\ESC"
  
  ; Remove registry entries
  DeleteRegKey HKCU "Software\ESC"
!macroend