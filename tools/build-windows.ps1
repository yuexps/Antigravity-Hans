#requires -Version 7.0

param(
    [string]$OutputPath = 'dist/antigravity-hans-windows-amd64-local.exe'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$overlayPath = Join-Path $repoRoot 'antigravity-hans-overlay.js'
if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
} else {
    $resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
}
$distDir = Split-Path -Parent $resolvedOutput
$temporaryPath = Join-Path $distDir ('.antigravity-hans-' + [guid]::NewGuid().ToString('N') + '.exe')

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    throw '未找到 Go 编译器。请安装 go.mod 要求的 Go 版本并将其加入 PATH。'
}

$version = (Get-Content -LiteralPath (Join-Path $repoRoot 'VERSION') -Raw).Trim()
if ($version -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+$') {
    throw 'VERSION 格式无效，无法标记本地测试构建。'
}
$overlayHash = (Get-FileHash -LiteralPath $overlayPath -Algorithm SHA256).Hash.ToLowerInvariant()
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

$oldGoos = $env:GOOS
$oldGoarch = $env:GOARCH
$oldCgoEnabled = $env:CGO_ENABLED
Push-Location $repoRoot
try {
    $env:GOOS = 'windows'
    $env:GOARCH = 'amd64'
    $env:CGO_ENABLED = '0'
    & go build -trimpath -buildvcs=false -ldflags "-s -w -X main.Version=$version-local" -o $temporaryPath .
    if ($LASTEXITCODE -ne 0) {
        throw "Go 构建失败，退出码：$LASTEXITCODE"
    }
    $finalOverlayHash = (Get-FileHash -LiteralPath $overlayPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($finalOverlayHash -ne $overlayHash) {
        throw '构建期间词库发生变化，请重新构建。'
    }
    Move-Item -LiteralPath $temporaryPath -Destination $resolvedOutput -Force
    Write-Host "已生成：$resolvedOutput"
    Write-Host "内嵌词库 SHA-256：$overlayHash"
    Write-Host "程序 SHA-256：$((Get-FileHash -LiteralPath $resolvedOutput -Algorithm SHA256).Hash.ToLowerInvariant())"
} finally {
    $env:GOOS = $oldGoos
    $env:GOARCH = $oldGoarch
    $env:CGO_ENABLED = $oldCgoEnabled
    Pop-Location
    if (Test-Path -LiteralPath $temporaryPath) {
        Remove-Item -LiteralPath $temporaryPath
    }
}
