@echo off
cd /d "%~dp0"
node scripts/startM5Local.cjs
if errorlevel 1 pause
