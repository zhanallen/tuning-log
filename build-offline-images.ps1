# Tuning Log System - Offline Docker Images Exporter (PowerShell)
# This script builds and exports all required docker images as .tar files for offline deployment.

$ErrorActionPreference = "Stop"

$projectName = (Get-Item .).Name.ToLower().Replace(" ", "-").Replace("_", "-")
$imageDir = "docker-images"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  正在準備導出離線 Docker 映像檔 (專案名稱: $projectName)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

# 1. Create docker-images directory
if (Test-Path $imageDir) {
    Remove-Item -Recurse -Force $imageDir
}
New-Item -ItemType Directory -Path $imageDir | Out-Null

# 2. Build images using docker compose
Write-Host "正在建立 Docker 映像檔 (這需要一些時間)..." -ForegroundColor Cyan
& docker compose build

# 3. Save images as .tar files
$imagesToSave = @(
    @{ Name = "postgres:15-alpine"; File = "postgres-db.tar"; Label = "PostgreSQL 資料庫" },
    @{ Name = "$($projectName)-backend:latest"; File = "tuning-api.tar"; Label = "後端 API 服務" },
    @{ Name = "$($projectName)-frontend:latest"; File = "tuning-web.tar"; Label = "前端 Web 服務" },
    @{ Name = "$($projectName)-nginx:latest"; File = "tuning-gateway.tar"; Label = "Nginx 網關代理" }
)

foreach ($img in $imagesToSave) {
    $imgName = $img.Name
    $outFile = Join-Path $imageDir $img.File
    $label = $img.Label
    
    Write-Host "正在導出 $label ($imgName) -> $($img.File)..." -ForegroundColor Cyan
    try {
        & docker save -o $outFile $imgName
        Write-Host "導出成功！" -ForegroundColor Green
    } catch {
        Write-Warning "導出 $imgName 失敗。請檢查映像檔是否存在。"
    }
}

# 4. Create load-images.bat and load-images.sh inside docker-images
Write-Host "正在產生映像檔載入腳本..." -ForegroundColor Cyan

$loadBat = @"
@echo off
echo ===================================================
echo   Tuning Log - Offline Docker Images Loader
echo ===================================================
echo.
echo Checking Docker service status...
docker --version >nul 2>&1
if %errorlevel% equ 0 goto DOCKER_OK
echo [ERROR] Docker is not running. Please start Docker Desktop.
pause
exit /b 1

:DOCKER_OK
echo.
echo Loading PostgreSQL image...
if exist postgres-db.tar docker load -i postgres-db.tar

echo Loading Backend API image...
if exist tuning-api.tar docker load -i tuning-api.tar

echo Loading Frontend Web image...
if exist tuning-web.tar docker load -i tuning-web.tar

echo Loading Nginx Gateway image...
if exist tuning-gateway.tar docker load -i tuning-gateway.tar

echo.
echo ===================================================
echo   Images Loaded Successfully!
echo   You can now run start.bat in the parent directory.
echo ===================================================
pause
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $imageDir "load-images.bat"), $loadBat, $utf8NoBom)

$loadSh = @"
#!/bin/bash
echo "==================================================="
echo "  調車日誌系統 - 離線 Docker 映像檔載入器"
echo "==================================================="
echo ""
if ! command -v docker &> /dev/null; then
    echo "[錯誤] 偵測不到 Docker。請啟動 Docker 服務後再試。"
    exit 1
fi

for f in postgres-db.tar tuning-api.tar tuning-web.tar tuning-gateway.tar; do
    if [ -f "$f" ]; then
        echo "正在載入 $f..."
        docker load -i "$f"
    fi
done

echo ""
echo "==================================================="
echo "  映像檔載入完成！"
echo "  現在你可以回到上層目錄，執行 ./start.sh 來啟動系統。"
echo "==================================================="
read -n 1 -s -r -p "按任意鍵退出此視窗..."
echo ""
"@
[System.IO.File]::WriteAllText((Join-Path $imageDir "load-images.sh"), $loadSh, $utf8NoBom)

Write-Host "離線映像檔打包完成！已存儲於 ./docker-images/" -ForegroundColor Green
Write-Host "如果你需要離線部署，請將 'docker-images' 資料夾一同攜帶至新電腦，並在該資料夾內執行 'load-images.bat' 即可。" -ForegroundColor Green
