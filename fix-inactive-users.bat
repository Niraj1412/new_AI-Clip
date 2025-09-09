@echo off
echo ========================================
echo 🔧 Fixing Inactive Paid Users
echo ========================================
echo.

echo 🌐 Calling API to fix inactive users...
echo.

powershell -Command "& { try { $response = Invoke-WebRequest -Uri 'https://clipsmartai.com/api-node/api/v1/payments/fix-inactive-users' -Method POST -ContentType 'application/json' -UseBasicParsing; Write-Host 'Response:'; Write-Host $response.Content } catch { Write-Host 'Error:' $_.Exception.Message } }"

echo.
echo ========================================
echo ✅ Command completed!
echo ========================================
echo.
pause
