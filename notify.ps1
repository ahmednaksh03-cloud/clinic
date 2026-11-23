<#
============================================================
NOTIFY.PS1 - Phone Completion Notification Script
Clinic Zone Project - C:\Users\ahmed\OneDrive\Desktop\clinic
============================================================
#>

# ============================================================
# CONFIGURATION VARIABLES - FILL IN YOUR CREDENTIALS
# ============================================================
$PHONE = "+201093826954"
$TWILIO_SID = ""           # Your Twilio Account SID
$TWILIO_TOKEN = ""         # Your Twilio Auth Token
$TWILIO_FROM = ""          # Your Twilio phone number (E.164 format, e.g., "+15551234567")
$CALLMEBOT_APIKEY = ""     # Your CallMeBot API key for WhatsApp

# ============================================================
# LOCAL FEEDBACK - Subtle console beep
# ============================================================
try {
    [console]::Beep(880, 200)   # A5 note, 200ms
    [console]::Beep(1046, 200)  # C6 note, 200ms
} catch {}

# ============================================================
# TWILIO VOICE CALL (Arabic - Polly.Zeina voice)
# ============================================================
if ($TWILIO_SID -and $TWILIO_TOKEN -and $TWILIO_FROM) {
    try {
        $url = "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_SID/Calls.json"

        # TwiML for Arabic voice message (URL-encoded UTF-8)
        $twiml = '<Response><Say voice="Polly.Zeina" language="arb">%D8%AA%D9%85%20%D8%A7%D9%84%D8%A7%D9%86%D8%AA%D9%87%D8%A7%D8%A1%20%D9%85%D9%86%20%D8%A7%D9%84%D9%85%D9%87%D9%85%D8%A9%20%D9%8A%D8%A7%20%D8%AF%D9%83%D8%AA%D9%88%D8%B1%20%D8%A3%D8%AD%D9%85%D8%AF</Say></Response>'
        $twimlEncoded = [System.Web.HttpUtility]::UrlEncode($twiml)

        $body = "To=$PHONE&From=$TWILIO_FROM&Twiml=$twimlEncoded"

        $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${TWILIO_SID}:${TWILIO_TOKEN}"))
        $headers = @{ Authorization = "Basic $auth" }

        $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body -ContentType "application/x-www-form-urlencoded"
        Write-Host "Twilio call initiated: $($response.sid)"
    } catch {
        Write-Warning "Twilio call failed: $($_.Exception.Message)"
    }
} else {
    Write-Host "Twilio credentials not configured - skipping voice call"
}

# ============================================================
# CALLMEBOT WHATSAPP ALERT
# ============================================================
if ($CALLMEBOT_APIKEY) {
    try {
        $phoneForWhatsApp = "201093826954"  # No + prefix for CallMeBot
        $text = "%E2%9C%85%20%D8%AA%D9%85%20%D8%A7%D9%84%D8%A7%D9%86%D8%AA%D9%87%D8%A7%D8%A1%20%D9%85%D9%86%20%D8%A7%D9%84%D9%85%D9%87%D9%85%D8%A9%20%D9%8A%D8%A7%20%D8%AF%D9%83%D8%AA%D9%88%D8%B1%20%D8%A3%D8%AD%D9%85%D8%AF"
        $url = "https://api.callmebot.com/whatsapp.php?phone=$phoneForWhatsApp&text=$text&apikey=$CALLMEBOT_APIKEY"

        $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
        Write-Host "WhatsApp alert sent via CallMeBot"
    } catch {
        Write-Warning "CallMeBot WhatsApp failed: $($_.Exception.Message)"
    }
} else {
    Write-Host "CallMeBot API key not configured - skipping WhatsApp alert"
}

# ============================================================
# COMPLETION CONFIRMATION
# ============================================================
Write-Host "`n=========================================="
Write-Host "TASK COMPLETED - CLINIC ZONE DEPLOYED"
Write-Host "=========================================="
Write-Host "Patient page: https://ahmednaksh03-cloud.github.io/clinic/patient.html"
Write-Host "Doctor dashboard: https://ahmednaksh03-cloud.github.io/clinic/doctor.html"
Write-Host "=========================================="