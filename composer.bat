@echo off
setlocal
cd /d "%~dp0"
if not exist ".tools\composer.phar" (
  echo Composer em falta. Consulta docs\GOOGLE-LOGIN.md para instalar.
  exit /b 1
)
"C:\xampp\php\php.exe" ".tools\composer.phar" %*
exit /b %errorlevel%
