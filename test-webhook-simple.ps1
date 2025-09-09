# Simple webhook test using PowerShell
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🔧 Testing Webhook Endpoint" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "🌐 Testing webhook with PowerShell..." -ForegroundColor Yellow
Write-Host ""

# Test payload
$jsonPayload = @"
{
  "id": "evt_test_direct",
  "object": "event",
  "api_version": "2025-08-27.basil",
  "created": $([int](Get-Date -UFormat %s)),
  "data": {
    "object": {
      "id": "cs_test_direct_webhook",
      "object": "checkout.session",
      "customer": "cus_test_direct",
      "metadata": {
        "userId": "test_user_123",
        "planType": "pro"
      },
      "payment_status": "paid",
      "status": "complete"
    }
  },
  "livemode": false,
  "pending_webhooks": 1,
  "request": {
    "id": null,
    "idempotency_key": null
  },
  "type": "checkout.session.completed"
}
"@

# Test headers
$headers = @{
    "Content-Type" = "application/json"
    "Stripe-Signature" = "t=1757442589,v1=08c281d4ff324b8e3ab616f3cd4f09a504989c4fa5e142b069fd98bd32d090a0"
}

Write-Host "📡 Sending test request..." -ForegroundColor Blue
Write-Host "URL: https://clipsmartai.com/api/v1/payments/webhook" -ForegroundColor White
Write-Host "Method: POST" -ForegroundColor White
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri "https://clipsmartai.com/api/v1/payments/webhook" -Method POST -Headers $headers -Body $jsonPayload -UseBasicParsing

    Write-Host "✅ SUCCESS!" -ForegroundColor Green
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    Write-Host $response.Content -ForegroundColor White
    Write-Host ""

    if ($response.StatusCode -eq 200) {
        Write-Host "🎉 Webhook is working correctly!" -ForegroundColor Green
        Write-Host "✅ Signature verification passed" -ForegroundColor Green
        Write-Host "✅ Webhook processed successfully" -ForegroundColor Green
    }

} catch {
    Write-Host "❌ FAILED!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""

    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "🚨 Status 400: Webhook signature verification failed" -ForegroundColor Red
        Write-Host "This means the webhook is still getting parsed JSON instead of raw body" -ForegroundColor Yellow
    } elseif ($_.Exception.Response.StatusCode -eq 500) {
        Write-Host "🚨 Status 500: Server error" -ForegroundColor Red
        Write-Host "Check server logs for more details" -ForegroundColor Yellow
    } else {
        Write-Host "🚨 Unexpected status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Test completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "Press Enter to exit"
