@echo off
echo ===== MaBourse 💰 - Script d'installation =====
echo.

echo Etape 1/4 - Nettoyage du repertoire
set /p confirm_clean=Souhaitez-vous proceder au nettoyage du repertoire? (O/N): 
if /i "%confirm_clean%"=="O" (
    echo Nettoyage en cours...
    if exist node_modules rmdir /s /q node_modules
    if exist package-lock.json del package-lock.json
    echo Nettoyage termine!
) else (
    echo Nettoyage ignore.
)
echo.
