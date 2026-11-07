@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Ilk calistirma: paketler kuruluyor...
  call npm install
)
start "" http://localhost:5173
call npm run dev
