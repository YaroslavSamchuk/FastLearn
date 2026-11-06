# FastLearn — 100% Client-Side React App
$Host.UI.RawUI.WindowTitle = "FastLearn — Dansk AI Tutor"

Set-Location "$PSScriptRoot\frontend"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "     🇩🇰 FastLearn — LingQ AI Tutor (Static React)      " -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Запуск на http://localhost:5173 ..." -ForegroundColor Green

Start-Process "http://localhost:5173"
npm run dev
