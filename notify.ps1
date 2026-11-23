$BARK_KEY = "nn4CMRk52XsffJ5S8U4CWn"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [console]::Beep(880, 200); [console]::Beep(1046, 200) } catch {}
try {
    $res = Invoke-RestMethod -Uri "https://api.day.app/$BARK_KEY/Clinic%20Zone/Task%20Completed?call=1&level=critical&sound=multiwayinvitation&volume=10" -TimeoutSec 20
    Write-Host "Bark: $($res.message)"
} catch {
    Write-Host "Bark error: $($_.Exception.Message)"
}
