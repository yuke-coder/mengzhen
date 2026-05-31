chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Continue"
$ProjectDir = "D:\梦枕\projects"
$LogFile = "D:\梦枕\auto-deploy.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    try {
        Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction Stop
    } catch {
        $fallbackLog = "$env:TEMP\mengzhen-deploy.log"
        Add-Content -Path $fallbackLog -Value $line -Encoding UTF8
    }
}

Write-Log "===== Auto Deploy Service Started ====="
Write-Log "Project: $ProjectDir"
Write-Log "User: $env:USERNAME"
Write-Log "PID: $PID"

Set-Location -LiteralPath $ProjectDir
if (-not (Test-Path -LiteralPath $ProjectDir)) {
    Write-Log "FATAL: Project directory not found: $ProjectDir"
    exit 1
}

Write-Log "Working directory: $(Get-Location)"

$gitCheck = git --version 2>&1
Write-Log "Git: $gitCheck"

while ($true) {
    try {
        $null = git diff --quiet 2>&1
        $hasUnstaged = ($LASTEXITCODE -ne 0)

        $null = git diff --cached --quiet 2>&1
        $hasStaged = ($LASTEXITCODE -ne 0)

        $hasUntracked = $false
        $untrackedOutput = git ls-files --others --exclude-standard 2>&1
        if ($untrackedOutput -and $untrackedOutput.ToString().Trim() -ne "") {
            $hasUntracked = $true
        }

        if ($hasUnstaged -or $hasStaged -or $hasUntracked) {
            $date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Write-Log "Changes detected, deploying..."

            git add .
            if ($LASTEXITCODE -eq 0) {
                git commit -m "Auto deploy $date"
                if ($LASTEXITCODE -eq 0) {
                    $pushSuccess = $true

                    git push origin main 2>&1 | ForEach-Object { Write-Log "  [origin] $_" }
                    if ($LASTEXITCODE -ne 0) {
                        Write-Log "  WARNING: Push to origin failed"
                        $pushSuccess = $false
                    }

                    git push gitee main 2>&1 | ForEach-Object { Write-Log "  [gitee] $_" }
                    if ($LASTEXITCODE -ne 0) {
                        Write-Log "  WARNING: Push to gitee failed"
                        $pushSuccess = $false
                    }

                    if ($pushSuccess) {
                        Write-Log "Deploy completed at $date"
                    }
                } else {
                    Write-Log "Nothing to commit (possibly empty commit)"
                }
            } else {
                Write-Log "git add failed"
            }
        }
    } catch {
        Write-Log "ERROR: $($_.Exception.Message)"
    }

    Start-Sleep 5
}
