@echo off
echo ========================================
echo 🔧 Testing Webhook Endpoint
echo ========================================
echo.

echo 🌐 Testing webhook with curl...
echo.

curl -X POST "https://clipsmartai.com/api/v1/payments/webhook" ^
  -H "Content-Type: application/json" ^
  -H "Stripe-Signature: t=1757442589,v1=08c281d4ff324b8e3ab616f3cd4f09a504989c4fa5e142b069fd98bd32d090a0" ^
  -d "{ ^
    \"id\": \"evt_test_direct\", ^
    \"object\": \"event\", ^
    \"api_version\": \"2025-08-27.basil\", ^
    \"created\": 1757442589, ^
    \"data\": { ^
      \"object\": { ^
        \"id\": \"cs_test_direct_webhook\", ^
        \"object\": \"checkout.session\", ^
        \"customer\": \"cus_test_direct\", ^
        \"metadata\": { ^
          \"userId\": \"test_user_123\", ^
          \"planType\": \"pro\" ^
        }, ^
        \"payment_status\": \"paid\", ^
        \"status\": \"complete\" ^
      } ^
    }, ^
    \"livemode\": false, ^
    \"pending_webhooks\": 1, ^
    \"request\": { ^
      \"id\": null, ^
      \"idempotency_key\": null ^
    }, ^
    \"type\": \"checkout.session.completed\" ^
  }"

echo.
echo ========================================
echo ✅ Test completed!
echo ========================================
echo.
pause
