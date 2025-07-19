@echo off
setlocal enabledelayedexpansion

REM ALP Experimental Build Script (Windows)
REM Generates a timestamp tag and pushes it to trigger automated build

echo 🚀 Starting automated build process...

REM Generate timestamp in format YYYYMMDD-HHmmss
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "TIMESTAMP=%YYYY%%MM%%DD%-%HH%%Min%%Sec%"
set "TAG_NAME=build-%TIMESTAMP%"

echo 📅 Generated timestamp: %TIMESTAMP%
echo 🏷️  Tag name: %TAG_NAME%

REM Ensure we're in a git repository
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: Not in a git repository
    exit /b 1
)

REM Check if there are uncommitted changes
git diff-index --quiet HEAD --
if errorlevel 1 (
    echo ⚠️  Warning: You have uncommitted changes
    set /p "continue=Do you want to continue anyway? (y/N): "
    if /i not "!continue!"=="y" (
        echo ❌ Build cancelled
        exit /b 1
    )
)

REM Get current branch
for /f %%i in ('git branch --show-current') do set "CURRENT_BRANCH=%%i"
echo 📋 Current branch: %CURRENT_BRANCH%

REM Create and push the tag
echo 🏷️  Creating tag...
git tag "%TAG_NAME%" -m "Automated build trigger - %TIMESTAMP%"

echo 📤 Pushing tag to origin...
git push origin "%TAG_NAME%"

echo ✅ Build triggered successfully!
for /f %%i in ('git config --get remote.origin.url') do set "REPO_URL=%%i"
for /f "tokens=2 delims=/" %%a in ("%REPO_URL:github.com/=%") do set "REPO_PATH=%%a"
set "REPO_PATH=%REPO_PATH:.git=%"
echo 🔗 You can monitor the build at: https://github.com/%REPO_PATH%/actions
echo 🏷️  Tag: %TAG_NAME%
echo.
echo 💡 To delete this tag later (if needed):
echo    git tag -d %TAG_NAME%
echo    git push origin --delete %TAG_NAME%

pause