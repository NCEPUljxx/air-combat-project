#Requires -Version 5.1
# 讲解发言稿 Markdown -> PDF（Pandoc + XeLaTeX）
$ErrorActionPreference = "Stop"

$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
if ($machinePath -and $userPath) {
  $env:PATH = "$machinePath;$userPath"
} elseif ($machinePath) {
  $env:PATH = "$machinePath;$env:PATH"
}

$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$Md = Join-Path $Root "讲解发言稿.md"
$PdfOut = Join-Path $Root "讲解发言稿.pdf"
$xelatexCmd = Get-Command xelatex -ErrorAction SilentlyContinue
$pandocCmd = Get-Command pandoc -ErrorAction SilentlyContinue

if (-not (Test-Path $Md)) { Write-Error "找不到: $Md" }
if (-not $pandocCmd) { Write-Error "未找到 pandoc。请安装 Pandoc 或加入 PATH。" }
if (-not $xelatexCmd) { Write-Error '未找到 xelatex。请安装 TeX Live / MiKTeX，或在 PowerShell 运行 where.exe xelatex 查清路径后加入 PATH。' }

Write-Host "使用: $($xelatexCmd.Source)"
& pandoc $Md -o $PdfOut `
  --pdf-engine="$($xelatexCmd.Source)" `
  -V CJKmainfont="Microsoft YaHei" `
  -V geometry="a4paper,margin=2cm" `
  -V fontsize=11pt `
  --resource-path="$Root" `
  --pdf-engine-opt=-interaction=nonstopmode

Write-Host "完成: $PdfOut"
