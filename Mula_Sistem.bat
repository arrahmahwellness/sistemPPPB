@echo off
title SISTEM PENGURUSAN PEMBAHARUAN APC (PPPB) - AR RAHMAH WELLNESS
color 0A

echo ======================================================================
echo          SISTEM PENGURUSAN PEMBAHARUAN APC (PPPB) MPTK
echo                       AR RAHMAH WELLNESS
echo ======================================================================
echo.
echo  Memulakan pelayan sistem di http://localhost:3000 ...
echo.

:: Semak sama ada Node.js dipasang
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [RALAT] Node.js tidak dijumpai dalam komputer anda!
    echo Sila pastikan Node.js telah dipasang dari https://nodejs.org.
    echo.
    pause
    exit /b 1
)

:: Buka pelayar web ke sistem tempatan
start http://localhost:3000

:: Jalankan pelayan Node.js
echo  Pelayan sedang aktif. Jangan tutup tetingkap ini semasa menggunakan sistem.
echo.
node server.js

pause
