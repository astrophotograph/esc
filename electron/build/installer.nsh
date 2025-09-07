; Custom NSIS script for ESC installer
; Handles proper app closure during installation/uninstallation

!macro customHeader
  ; Nothing needed in header for now
!macroend

!macro preInit
  ; This macro is inserted at the beginning of the NSIS script
  SetRegView 64
  ShowWindow $HWNDPARENT ${SW_HIDE}
!macroend

!macro customInit
  ; During initial installation or upgrade, we don't need to check for running processes
  ; The uninstaller will handle cleanup if needed
  ShowWindow $HWNDPARENT ${SW_SHOW}
!macroend

!macro customInstall
  ; Custom installation steps
  DetailPrint "Installing ESC components..."
  
  ; Create necessary directories
  CreateDirectory "$INSTDIR\logs"
  CreateDirectory "$INSTDIR\config"
  
  ; Note: AccessControl plugin not available in electron-builder's NSIS
  ; Permissions will be handled by the application at runtime
!macroend

!macro customInstallMode
  ; Installation mode is handled by electron-builder
  ; We don't need to override the default behavior
!macroend

!macro customUnInit
  ; Try to close ESC gracefully using window messages
  FindWindow $0 "" "ESC"
  ${If} $0 != 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "ESC appears to be running.$\n$\nPlease close it before continuing with the uninstallation." IDOK +2
    Abort
    
    ; Try to close it
    DetailPrint "Closing ESC..."
    SendMessage $0 ${WM_CLOSE} 0 0
    Sleep 2000
  ${EndIf}
!macroend

!macro customUnInstall
  ; Clean up custom files and registry entries
  DetailPrint "Cleaning up ESC files..."
  
  ; Remove log files if user chooses
  MessageBox MB_YESNO "Do you want to remove log files and user data?" IDNO +3
  RMDir /r "$INSTDIR\logs"
  RMDir /r "$APPDATA\ESC"
  
  ; Remove registry entries
  DeleteRegKey HKCU "Software\ESC"
  
  ; Remove from Windows Firewall exceptions
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="ESC"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="ESC Backend"'
!macroend

; WM_CLOSE and WM_QUIT are already defined by electron-builder
; SW_HIDE and SW_SHOW are already defined in WinMessages.nsh