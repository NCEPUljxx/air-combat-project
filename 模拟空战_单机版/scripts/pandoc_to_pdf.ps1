#Requires -Version 5.1
# 实验报告：优先用 Pandoc + LaTeX(xelatex) 直接出 PDF；若无 LaTeX，则用 Pandoc 转 HTML 后由 Edge 无头打印为 PDF。
$ErrorActionPreference = "Stop"

# Cursor/部分终端未继承完整用户 PATH 时，先从注册表合并 Machine+User PATH（否则可能找不到 xelatex）
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
if ($machinePath -and $userPath) {
  $env:PATH = "$machinePath;$userPath"
} elseif ($machinePath) {
  $env:PATH = "$machinePath;$env:PATH"
}

# 脚本位于: 模拟空战_单机版/scripts/
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$Md = Join-Path $Root "实验报告_单机模式.md"
$PdfOut = Join-Path $Root "实验报告_单机模式.pdf"
$HtmlTmp = Join-Path $Root "_实验报告_单机模式_pandoc.html"

if (-not (Test-Path $Md)) {
  Write-Error "找不到: $Md"
}

$pandoc = Get-Command pandoc -ErrorAction SilentlyContinue
if (-not $pandoc) {
  Write-Error "未找到 pandoc，请先安装并加入 PATH。"
}

$xelatex = Get-Command xelatex -ErrorAction SilentlyContinue
if ($xelatex) {
  Write-Host "使用: pandoc + xelatex -> $PdfOut"
  & pandoc $Md -o $PdfOut `
    --pdf-engine=xelatex `
    -V CJKmainfont="Microsoft YaHei" `
    --resource-path="$Root;$Root\screenshots"
  Write-Host "完成: $PdfOut"
  exit 0
}

Write-Host "未检测到 xelatex，改用: pandoc -> HTML -> Edge 打印 -> $PdfOut"

& pandoc $Md -f markdown -t html5 -s `
  --resource-path="$Root;$Root\screenshots" `
  --metadata title="软件体系结构实验报告（单机）" `
  -o $HtmlTmp

$edgeCandidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
  Write-Error "未找到 Edge。请安装 Microsoft Edge，或安装 MiKTeX/TeX Live 后使用 xelatex 路径。"
}

$htmlUri = ([System.Uri](Resolve-Path $HtmlTmp)).AbsoluteUri
& $edge --headless=new --disable-gpu --no-pdf-header-footer "--print-to-pdf=$PdfOut" $htmlUri
Start-Sleep -Seconds 2
if (-not (Test-Path $PdfOut)) {
  Write-Error "PDF 未生成，请检查 Edge 是否正常。"
}
Write-Host "完成: $PdfOut （若打不开请关闭同名 PDF 后重试）"
