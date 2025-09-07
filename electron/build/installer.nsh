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
  ; Check if app is running and close it gracefully
  ${nsProcess::FindProcess} "ESC.exe" $R0
  ${If} $R0 == 0
    ; App is running, try to close it gracefully
    DetailPrint "ESC is running. Attempting to close it..."
    
    ; First try: Send WM_CLOSE to all ESC windows
    FindWindow $0 "" "ESC"
    IntCmp $0 0 +2
    SendMessage $0 ${WM_CLOSE} 0 0
    
    ; Wait a moment for graceful shutdown
    Sleep 2000
    
    ; Check again if still running
    ${nsProcess::FindProcess} "ESC.exe" $R0
    ${If} $R0 == 0
      ; Still running, try WM_QUIT
      FindWindow $0 "" "ESC"
      IntCmp $0 0 +2
      SendMessage $0 ${WM_QUIT} 0 0
      
      Sleep 2000
      
      ; Final check
      ${nsProcess::FindProcess} "ESC.exe" $R0
      ${If} $R0 == 0
        ; Last resort: Kill the process
        DetailPrint "Force closing ESC..."
        ${nsProcess::KillProcess} "ESC.exe" $R1
        Sleep 1000
      ${EndIf}
    ${EndIf}
  ${EndIf}
  
  ; Also check for any background processes
  ${nsProcess::FindProcess} "main.exe" $R0
  ${If} $R0 == 0
    DetailPrint "Closing ESC backend process..."
    ${nsProcess::KillProcess} "main.exe" $R1
    Sleep 500
  ${EndIf}
  
  ShowWindow $HWNDPARENT ${SW_SHOW}
!macroend

!macro customInstall
  ; Custom installation steps
  DetailPrint "Installing ESC components..."
  
  ; Create necessary directories
  CreateDirectory "$INSTDIR\logs"
  CreateDirectory "$INSTDIR\config"
  
  ; Set permissions for log directory (allow all users to write)
  AccessControl::GrantOnFile "$INSTDIR\logs" "(S-1-5-32-545)" "FullAccess"
!macroend

!macro customInstallMode
  ; Force per-user installation if running without admin rights
  ${If} ${UAC_IsAdmin}
    ; Admin mode - can install for all users
  ${Else}
    ; User mode - install for current user only
    StrCpy $INSTMODE CurrentUser
  ${EndIf}
!macroend

!macro customUnInit
  ; Check if app is running before uninstall
  ${nsProcess::FindProcess} "ESC.exe" $R0
  ${If} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "ESC is currently running.$\n$\nPlease close it before continuing with the uninstallation." IDOK +2
    Abort
    
    ; Try to close it
    DetailPrint "Closing ESC..."
    FindWindow $0 "" "ESC"
    IntCmp $0 0 +2
    SendMessage $0 ${WM_CLOSE} 0 0
    
    Sleep 2000
    
    ; Force kill if still running
    ${nsProcess::FindProcess} "ESC.exe" $R0
    ${If} $R0 == 0
      ${nsProcess::KillProcess} "ESC.exe" $R1
      Sleep 1000
    ${EndIf}
  ${EndIf}
  
  ; Also close backend
  ${nsProcess::FindProcess} "main.exe" $R0
  ${If} $R0 == 0
    ${nsProcess::KillProcess} "main.exe" $R1
    Sleep 500
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

; Helper function to check if process is running
!macro CheckRunning
  ${nsProcess::FindProcess} "ESC.exe" $R0
  ${If} $R0 == 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
      "ESC is still running.$\n$\nPlease close it manually and click Retry to continue." \
      IDRETRY CheckAgain IDCANCEL AbortInstall
    CheckAgain:
      Goto CheckRunning
    AbortInstall:
      Abort "Installation cancelled"
  ${EndIf}
!macroend

; Include required plugins
!addplugindir /x86-ansi "${NSISDIR}\Plugins\x86-ansi"
!addplugindir /x86-unicode "${NSISDIR}\Plugins\x86-unicode"

; Required definitions
!define WM_CLOSE 0x0010
!define WM_QUIT 0x0012
!define SW_HIDE 0
!define SW_SHOW 5