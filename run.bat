@echo off
chcp 65001 > nul
echo =======================================================
echo          🇩🇰 FastLearn — LingQ AI Tutor (Static React)
echo =======================================================
echo.

cd /d "%~dp0frontend"

echo Запуск статичного React застосунку на http://localhost:5173 ...
start http://localhost:5173

npm run dev
pause
