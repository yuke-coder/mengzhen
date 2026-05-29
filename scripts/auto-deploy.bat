@echo off
cls

echo.
echo   Auto Deploy Service Started
echo   --------------------------
echo   Watching for code changes...
echo   Service runs until system shutdown
echo.

:LOOP
git diff --quiet
if %errorlevel% neq 0 (
    echo.
    echo   [INFO] Detected changes!
    
    for /f "tokens=1-4 delims=/: " %%a in ("%time%") do (
        set H=%%a
        set M=%%b
        set S=%%c
    )
    
    set MSG=Auto deploy %date% %H%:%M%:%S%
    
    echo   [INFO] Committing: %MSG%
    
    git add .
    git commit -m "%MSG%"
    
    echo   [INFO] Pushing to GitHub...
    git push origin main
    
    echo   [INFO] Pushing to Gitee...
    git push gitee main
    
    echo   [SUCCESS] Deploy completed!
    echo   [INFO] Users will get updates on refresh
    echo.
)

ping -n 3 127.0.0.1 >nul
goto LOOP