# PowerShell script to fix inactive paid users
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🔧 Fixing Inactive Paid Users" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "🌐 Calling API to fix inactive users..." -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri "https://clipsmartai.com/api-node/api/v1/payments/fix-inactive-users" -Method POST -ContentType "application/json" -UseBasicParsing

    Write-Host "✅ API Response:" -ForegroundColor Green
    Write-Host $response.Content -ForegroundColor White
    Write-Host ""

    # Parse and display results
    $data = $response.Content | ConvertFrom-Json
    if ($data.success) {
        Write-Host "📊 Results:" -ForegroundColor Blue
        Write-Host "   Total users found: $($data.totalFound)" -ForegroundColor White
        Write-Host "   Users fixed: $($data.fixedCount)" -ForegroundColor Green

        if ($data.results -and $data.results.Count -gt 0) {
            Write-Host "   Fixed users:" -ForegroundColor Yellow
            foreach ($user in $data.results) {
                Write-Host "     - $($user.email): $($user.oldStatus) → $($user.newStatus) ($($user.planType))" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "❌ Failed: $($data.message)" -ForegroundColor Red
    }

} catch {
    Write-Host "❌ Error occurred:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Make sure your backend server is running and accessible." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Command completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "Press Enter to exit"
