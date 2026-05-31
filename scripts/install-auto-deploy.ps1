$TaskName = "MengzhenAutoDeploy"
$ScriptPath = "D:\梦枕\projects\scripts\auto-deploy.ps1"

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed existing task: $TaskName"
}

$pwshPath = (Get-Command powershell.exe).Source

$Action = New-ScheduledTaskAction `
    -Execute $pwshPath `
    -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$ScriptPath`"" `
    -WorkingDirectory "D:\梦枕\projects"

$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -MultipleInstances IgnoreNew `
    -Hidden

$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Mengzhen Auto Deploy: monitor code changes and auto push to remote repos" | Out-Null

Write-Host ""
Write-Host "===== Task Registered =====" -ForegroundColor Green
Write-Host "  Name:    $TaskName"
Write-Host "  Script:  $ScriptPath"
Write-Host "  Trigger: At user logon"
Write-Host "  Log:     D:\梦枕\auto-deploy.log"
Write-Host ""

Start-ScheduledTask -TaskName $TaskName
Write-Host "Starting task..." -ForegroundColor Yellow
Start-Sleep 3

$status = Get-ScheduledTask -TaskName $TaskName
Write-Host "  Status: $($status.State)" -ForegroundColor $(if($status.State -eq 'Running'){'Green'}else{'Yellow'})

$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host "  LastRun: $($info.LastRunTime)"
Write-Host "  Result:  $($info.LastResult)"
