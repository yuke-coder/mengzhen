$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "🚀 梦枕全自动部署服务" -ForegroundColor Cyan
Write-Host "-------------------" -ForegroundColor Cyan
Write-Host "服务已启动，正在监听代码变化..." -ForegroundColor Green
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Gray
Write-Host ""

$currentDir = Get-Location

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $currentDir
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.Filter = "*.*"
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName

$timer = $null
$debounceDelay = 2000

$deployScript = {
    Write-Host ""
    Write-Host "🔍 检测到代码变化！" -ForegroundColor Yellow
    
    $date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $message = "自动部署 $date"
    
    Write-Host "📝 提交信息：$message" -ForegroundColor Cyan
    
    # 提交源码
    git add .
    git commit -m $message
    
    Write-Host "⬆️ 推送到 GitHub..." -ForegroundColor Gray
    git push origin main
    
    Write-Host "⬆️ 推送到 码云 Gitee..." -ForegroundColor Gray
    git push gitee main
    
    Write-Host "✅ 部署成功！" -ForegroundColor Green
    Write-Host "🌐 Vercel: https://mengzhen-chi.vercel.app" -ForegroundColor Cyan
    Write-Host "💡 用户刷新页面即可获取最新版本" -ForegroundColor Gray
    Write-Host ""
}

$onChanged = Register-ObjectEvent $watcher "Changed" -Action {
    if ($Event.SourceEventArgs.FullPath -match "\\\.git\\|"\\node_modules\\") {
        return
    }
    if ($Event.SourceEventArgs.Name -match "^\." -or $Event.SourceEventArgs.Name -match "\.tmp$") {
        return
    }
    
    if ($timer -ne $null) {
        $timer.Stop()
        $timer.Dispose()
    }
    
    $timer = New-Object System.Timers.Timer($debounceDelay)
    $timer.AutoReset = $false
    $timer.Elapsed = $deployScript
    $timer.Start()
}

$onCreated = Register-ObjectEvent $watcher "Created" -Action {
    if ($Event.SourceEventArgs.FullPath -match "\\\.git\\|"\\node_modules\\") {
        return
    }
    if ($Event.SourceEventArgs.Name -match "^\." -or $Event.SourceEventArgs.Name -match "\.tmp$") {
        return
    }
    
    if ($timer -ne $null) {
        $timer.Stop()
        $timer.Dispose()
    }
    
    $timer = New-Object System.Timers.Timer($debounceDelay)
    $timer.AutoReset = $false
    $timer.Elapsed = $deployScript
    $timer.Start()
}

while ($true) {
    Start-Sleep -Seconds 1
}