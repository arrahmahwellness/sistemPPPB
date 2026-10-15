@echo off
title SISTEM PENGURUSAN PEMBAHARUAN APC (PPPB) - MOD ONLINE
chcp 65001 >nul
color 0B

echo ======================================================================
echo          SISTEM PENGURUSAN PEMBAHARUAN APC (PPPB) MPTK
echo                       AR RAHMAH WELLNESS
echo                       [ PELAYAN ONLINE ]
echo ======================================================================
echo.

:: Semak Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [RALAT] Node.js tidak dijumpai dalam komputer anda!
    pause
    exit /b 1
)

:: Semak cloudflared
if not exist "bin\cloudflared.exe" (
    echo [RALAT] bin\cloudflared.exe tidak dijumpai!
    pause
    exit /b 1
)

:: Jalankan pelayan Node di latar belakang jika port 3000 belum aktif
powershell -NoProfile -Command "if (!(Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue)) { Start-Process -WindowStyle Hidden node -ArgumentList 'server.js' }"

echo  Pelayan tempatan aktif di http://localhost:3000
echo  Menghubungkan sistem ke Internet (Cloudflare Tunnel)...
echo.
echo ======================================================================
echo  PAUTAN INTERNET AKAN TERPAPAR DI BAWAH (Cari baris *.trycloudflare.com):
echo  Salin pautan tersebut dan tambah /borang.html untuk dihantar kepada pengamal.
echo ======================================================================
echo.

:: Jalankan Cloudflare Tunnel
bin\cloudflared.exe tunnel --url http://localhost:3000

pause
