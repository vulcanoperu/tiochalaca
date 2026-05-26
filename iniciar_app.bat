@echo off
title Iniciador Tio Chalaca
color 0A

echo ========================================================
echo        INICIANDO TIO CHALACA (BACKEND + FRONTEND)
echo ========================================================
echo.
echo Iniciando servidor Backend en una nueva ventana...
start "Backend - Tio Chalaca" cmd /k "npm run server"

echo.
echo Iniciando servidor Frontend en una nueva ventana...
start "Frontend - Tio Chalaca" cmd /k "npm run dev"

echo.
echo ========================================================
echo   Listo! Las consolas se abrieron en ventanas separadas.
echo   Ya puedes minimizar esta ventana o cerrarla.
echo ========================================================
pause
