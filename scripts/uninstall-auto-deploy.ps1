$TaskName = "MengzhenAutoDeploy"

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Task '$TaskName' has been removed." -ForegroundColor Green
} else {
    Write-Host "Task '$TaskName' not found." -ForegroundColor Yellow
}
