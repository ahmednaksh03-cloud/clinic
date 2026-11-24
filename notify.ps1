[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [console]::Beep(880, 200); [console]::Beep(1046, 200) } catch {}
try {
    Invoke-RestMethod -Uri "https://ntfy.sh/clinic-zone-ahmed-2026" -Method Post -Headers @{ "Title" = "Clinic Zone"; "Priority" = "urgent"; "Tags" = "white_check_mark" } -Body "Clinic Zone Updated - Pushed to GitHub" -TimeoutSec 20 | Out-Null
    "$(Get-Date): Sent OK" | Out-File "notify-log.txt" -Append
} catch {
    "$(Get-Date): Error - $($_.Exception.Message)" | Out-File "notify-log.txt" -Append
}