$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "🚀 梦枕全自动部署服务" -ForegroundColor Cyan
Write-Host "-------------------" -ForegroundColor Cyan
Write-Host "服务已启动，正在监听代码变化..." -ForegroundColor Green
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Gray
Write-Host ""

# 获取当前目录
$currentDir = Get-Location

# 创建文件系统监听器
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $currentDir
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.Filter = "*.*"
# 忽略 .git 目录和 node_modules
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName

# 避免重复触发的计时器
$timer = $null
$debounceDelay = 2000  # 2秒防抖

# 文件变化事件处理
$onChanged = Register-ObjectEvent $watcher "Changed" -Action {
    # 忽略 .git 目录和 node_modules
    if ($Event.SourceEventArgs.FullPath -match "\\\.git\\|"\\node_modules\\") {
        return
    }
    
    # 忽略临时文件
    if ($Event.SourceEventArgs.Name -match "^\." -or $Event.SourceEventArgs.Name -match "\.tmp$") {
        return
    }
    
    # 清除之前的计时器
    if ($timer -ne $null) {
        $timer.Stop()
        $timer.Dispose()
    }
    
    # 创建新计时器，延迟2秒后执行部署
    $timer = New-Object System.Timers.Timer($debounceDelay)
    $timer.AutoReset = $false
    $timer.Elapsed = {
        Write-Host ""
        Write-Host "🔍 检测到代码变化！" -ForegroundColor Yellow
        
        $date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $message = "自动部署 $date"
        
        Write-Host "📝 提交信息：$message" -ForegroundColor Cyan
        
        git add .
        git commit -m $message
        git push origin main
        
        Write-Host "✅ 部署成功！" -ForegroundColor Green
        Write-Host "💡 用户刷新页面即可获取最新版本" -ForegroundColor Gray
        Write-Host ""
    }
    $timer.Start()
}

# 文件创建事件处理
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
    $timer.Elapsed = {
        Write-Host ""
        Write-Host "🔍 检测到新文件！" -ForegroundColor Yellow
        
        $date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $message = "自动部署 $date"
        
        Write-Host "📝 提交信息：$message" -ForegroundColor Cyan
        
        git add .
        git commit -m $message
        git push origin main
        
        Write-Host "✅ 部署成功！" -ForegroundColor Green
        Write-Host "💡 用户刷新页面即可获取最新版本" -ForegroundColor Gray
        Write-Host ""
    }
    $timer.Start()
}

# 保持脚本运行
while ($true) {
    Start-Sleep -Seconds 1
}