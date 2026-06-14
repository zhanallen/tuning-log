# Tuning Log System - Deployment Packager Script (PowerShell)
# This script dumps the database, packages all necessary files, and creates a clean zip file.

$ErrorActionPreference = "Stop"

# 1. Read .env file for database configurations
Write-Host "正在讀取 .env 設定..." -ForegroundColor Cyan
$dbUser = "postgres"
$dbPass = "tuning_pass_8888"
$dbName = "tuning_log"

if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match "^([^=]+)=(.*)$") {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim()
            if ($key -eq "DB_USER") { $dbUser = $val }
            if ($key -eq "DB_PASSWORD") { $dbPass = $val }
            if ($key -eq "DB_NAME") { $dbName = $val }
        }
    }
}

# 2. Dump database data from running container
Write-Host "正在從 Docker 容器匯出資料庫備份..." -ForegroundColor Cyan
$containerName = "tuning-db"

# Check if the container is running
$containerCheck = docker ps --filter "name=$containerName" --format "{{.Names}}"
if ($containerCheck -eq $containerName) {
    try {
        # Export database inside container
        & docker exec -t $containerName sh -c "PGPASSWORD=$dbPass pg_dump -U $dbUser -d $dbName -f /tmp/init.sql"
        if ($LASTEXITCODE -eq 0) {
            # Copy file to host postgres-init/init.sql
            if (-not (Test-Path "postgres-init")) {
                New-Item -ItemType Directory -Path "postgres-init" | Out-Null
            }
            & docker cp "$($containerName):/tmp/init.sql" "./postgres-init/init.sql"
            & docker exec -t $containerName sh -c "rm /tmp/init.sql"
            Write-Host "資料庫備份成功！已存儲於 ./postgres-init/init.sql" -ForegroundColor Green
        } else {
            Write-Warning "pg_dump 執行失敗。將使用現有（或空）的 postgres-init/ 備份。"
        }
    } catch {
        Write-Warning "嘗試匯出資料庫時出錯: $_。將使用現有備份。"
    }
} else {
    Write-Warning "容器 '$containerName' 未在運行中，無法即時備份最新資料。將使用現有備份檔。"
}

# 3. Create clean packaging directory
$packageDir = "tuning-log-deploy"
Write-Host "正在建立臨時打包目錄..." -ForegroundColor Cyan
if (Test-Path $packageDir) {
    Remove-Item -Recurse -Force $packageDir
}
New-Item -ItemType Directory -Path $packageDir | Out-Null

# Exclude list for root files and folders
$excludeList = @(
    ".git", 
    ".agents", 
    ".claude", 
    "node_modules", 
    "dist", 
    "tuning-log-deploy", 
    "tuning-log-deploy.zip", 
    "package.ps1",
    "build-offline-images.ps1"
)

# Helper function to copy folders recursively while excluding specified patterns
function Copy-FolderSafe($src, $dest) {
    if (-not (Test-Path $dest)) {
        New-Item -ItemType Directory -Path $dest -Force | Out-Null
    }
    Get-ChildItem -Path $src -Force | ForEach-Object {
        $name = $_.Name
        if ($excludeList -notcontains $name) {
            if ($_.PsIsContainer) {
                # Skip sub-node_modules and dist folders
                if ($name -eq "node_modules" -or $name -eq "dist" -or $name -eq ".git" -or $name -eq ".agents" -or $name -eq ".claude") {
                    # Skip
                } else {
                    Copy-FolderSafe $_.FullName (Join-Path $dest $name)
                }
            } else {
                Copy-Item $_.FullName $dest -Force
            }
        }
    }
}

Write-Host "正在複製專案原始碼與設定檔..." -ForegroundColor Cyan
Copy-FolderSafe "." $packageDir

# 4. Generate deployment start scripts
Write-Host "正在產生啟動腳本與部署文件..." -ForegroundColor Cyan

# start.bat for Windows
$startBatContent = @"
@echo off
echo ===================================================
echo   Tuning Log System - Docker One-Click Deployer
echo ===================================================
echo.
echo Checking Docker service status...
docker --version >nul 2>&1
if %errorlevel% equ 0 goto DOCKER_OK
echo [ERROR] Docker is not running or not installed.
echo Please install and start Docker Desktop: https://www.docker.com/products/docker-desktop/
pause
exit /b 1

:DOCKER_OK
echo.
echo Starting Docker containers (this may take a few minutes)...
docker compose down
docker compose up --build -d
if %errorlevel% equ 0 goto DEPLOY_OK
echo.
echo [ERROR] Failed to start Docker containers. Please check the error messages above.
pause
exit /b 2

:DEPLOY_OK
echo.
echo ===================================================
echo   System Deployed Successfully!
echo ===================================================
echo   - Web Access (HTTPS): https://localhost:8443 (Recommended)
echo   - Web Access (HTTP):  http://localhost:8080
echo   - Database data auto-restored from postgres-init/init.sql
echo ===================================================
echo.
echo Press any key to exit...
pause >nul
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $packageDir "start.bat"), $startBatContent, $utf8NoBom)

# start.sh for Linux/Mac
$startShContent = @"
#!/bin/bash
echo "==================================================="
echo "  調車日誌系統 (Tuning Log) - Docker 一鍵部署啟動器"
echo "==================================================="
echo ""
if ! command -v docker &> /dev/null; then
    echo "[錯誤] 偵測不到 Docker。請先安裝 Docker 並啟動服務。"
    exit 1
fi

echo "正在啟動/建立 Docker 容器..."
docker compose down
docker compose up --build -d

echo ""
echo "==================================================="
echo "  系統部署成功！"
echo "==================================================="
echo "  - 瀏覽網頁 (HTTPS): https://localhost:8443 (推薦)"
echo "  - 瀏覽網頁 (HTTP):  http://localhost:8080"
echo "  - 資料庫資料：     已自動從 postgres-init/init.sql 匯入"
echo "==================================================="
echo ""
read -n 1 -s -r -p "按任意鍵退出此視窗..."
echo ""
"@
[System.IO.File]::WriteAllText((Join-Path $packageDir "start.sh"), $startShContent, $utf8NoBom)

# Create README_DEPLOY.md in Chinese
$readmeContent = @"
# 調車日誌系統 (Tuning Log) - Docker 部署說明文檔

本資料夾已打包了該系統的所有前後端程式碼、Nginx 網關代理、資料庫設定，以及**最新的資料庫備份數據**。你可以直接將此資料夾（或壓縮檔）攜帶至另一台電腦上，使用 Docker 進行一鍵部署。

---

## 🛠️ 準備工作

在部署前，目標電腦必須安裝並運行 Docker 軟體：
1. **Windows / macOS**:
   - 請下載並安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/)。
   - 安裝完成後，請確保 Docker Desktop 已經順利啟動（右下角鯨魚圖標變綠色）。
2. **Linux**:
   - 請安裝 `docker` 及 `docker-compose-plugin` (或 `docker-compose` 命令行工具)。

---

## 🚀 一鍵部署步驟

### 1. 執行啟動腳本
- **Windows**:
  - 直接按滑鼠右鍵點擊 **`start.bat`** 並選擇「以系統管理員身分執行」或直接雙擊執行。
- **Linux / macOS**:
  - 開啟終端機 (Terminal) 並切換至本目錄，執行以下指令：
    ```bash
    chmod +x start.sh
    ./start.sh
    ```

### 2. 開啟瀏覽器使用
啟動成功後，開啟瀏覽器（推薦使用 Chrome 瀏覽器）並訪問以下網址：
- **安全安全連線 (HTTPS - 推薦)**: `https://localhost:8443`
  - *注意：由於是使用本地自簽章 SSL 憑證，瀏覽器可能會提示安全性警告，請點擊「進階」並選擇「繼續前往 localhost (安全)」即可正常進入。*
- **一般連線 (HTTP)**: `http://localhost:8080`

---

## 🗄️ 資料庫還原與持久化說明

1. **自動還原最新資料**：
   - 本專案包含了已備份的 `postgres-init/init.sql` 數據庫檔案。
   - 當你在新電腦上**第一次**啟動 Docker 容器時，Postgres 容器會自動載入並還原此 SQL 檔中的所有表結構與歷史紀錄。
2. **資料持久化**：
   - 系統運行中的所有變更、新建立的調車日誌、上傳的 3D 車輛模型（GLB）將自動寫入 Docker 的具名磁碟卷 (`postgres_data` 與 `uploads_data`) 中，重啟容器或關閉電腦資料都不會遺失。

---

## 🛡️ 安全注意事項
- 本壓縮包包含了敏感的 `.env` 設定檔案（內含 JWT 金鑰以及資料庫密碼）。
- **請勿將打包後的 ZIP 檔或是解壓後的資料夾上傳到任何公開的 Git 倉庫（如 GitHub）**。
- 本專案已更新 `.gitignore`，確保在開發端不會誤將此壓縮檔與 SQL 備份檔提交。
"@
[System.IO.File]::WriteAllText((Join-Path $packageDir "README_DEPLOY.md"), $readmeContent, $utf8NoBom)

# 5. Compress the directory to ZIP file
Write-Host "正在將部署檔案壓縮為 tuning-log-deploy.zip..." -ForegroundColor Cyan
if (Test-Path "$packageDir.zip") {
    Remove-Item "$packageDir.zip" -Force
}
Compress-Archive -Path $packageDir -DestinationPath "$packageDir.zip" -Force
Write-Host "壓縮完成！已產生: $packageDir.zip" -ForegroundColor Green

# 6. Clean up temporary folder
Write-Host "正在清理臨時目錄..." -ForegroundColor Cyan
Remove-Item -Recurse -Force $packageDir
Write-Host "打包作業全部完成！" -ForegroundColor Green
