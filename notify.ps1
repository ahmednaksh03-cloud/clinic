$BARK_KEY = "nn4CMRk52XsffJ5S8U4CWn"

try {
    [console]::Beep(880, 200)
    [console]::Beep(1046, 200)
} catch {}

if ($BARK_KEY) {
    $url = "https://api.day.app/$BARK_KEY/Clinic%20Zone/Task%20Completed?call=1&level=critical&sound=alarm&volume=10"
    $res = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 15
    Write-Host "Bark status: $($res.message)"
}

Write-Host "`n=========================================="
Write-Host "TASK COMPLETED - CLINIC ZONE DEPLOYED"
Write-Host "=========================================="
