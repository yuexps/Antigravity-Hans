@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "DIST_DIR=%SCRIPT_DIR%dist"

echo =========================================
echo   Antigravity-Hans Go 交叉编译脚本 (Windows)
echo =========================================

where go >nul 2>nul
if errorlevel 1 (
    echo [ERROR] 未找到 Go 编译器。请先安装 Go: https://go.dev/dl/
    exit /b 1
)

for /f "delims=" %%v in ('go version') do echo [提示] 使用 %%v

if not exist "%SCRIPT_DIR%VERSION" (
    echo [ERROR] 未找到 VERSION 文件。
    exit /b 1
)
set /p VERSION=<"%SCRIPT_DIR%VERSION"
set "VERSION=%VERSION: =%"
echo [提示] 版本号: %VERSION%

if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"

pushd "%SCRIPT_DIR%"
set "CGO_ENABLED=0"

echo.
echo 开始编译...
echo.

echo ^>^>^> [1/5] macOS ARM64 (Apple Silicon)...
set "GOOS=darwin"
set "GOARCH=arm64"
go build -ldflags="-s -w -X main.Version=%VERSION%" -o "%DIST_DIR%\antigravity-hans-macos-arm64" .
if errorlevel 1 goto :fail

echo ^>^>^> [2/5] macOS AMD64 (Intel Mac)...
set "GOOS=darwin"
set "GOARCH=amd64"
go build -ldflags="-s -w -X main.Version=%VERSION%" -o "%DIST_DIR%\antigravity-hans-macos-amd64" .
if errorlevel 1 goto :fail

echo ^>^>^> [3/5] Windows AMD64...
set "GOOS=windows"
set "GOARCH=amd64"
go build -ldflags="-s -w -X main.Version=%VERSION%" -o "%DIST_DIR%\antigravity-hans-windows-amd64.exe" .
if errorlevel 1 goto :fail

echo ^>^>^> [4/5] Linux AMD64 (x64)...
set "GOOS=linux"
set "GOARCH=amd64"
go build -ldflags="-s -w -X main.Version=%VERSION%" -o "%DIST_DIR%\antigravity-hans-linux-amd64" .
if errorlevel 1 goto :fail

echo ^>^>^> [5/5] Linux ARM64...
set "GOOS=linux"
set "GOARCH=arm64"
go build -ldflags="-s -w -X main.Version=%VERSION%" -o "%DIST_DIR%\antigravity-hans-linux-arm64" .
if errorlevel 1 goto :fail

popd
echo.
echo =========================================
echo   编译完成！输出目录: %DIST_DIR%
echo =========================================
exit /b 0

:fail
popd
echo [ERROR] 编译失败。
exit /b 1
