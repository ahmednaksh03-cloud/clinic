[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [console]::Beep(880, 200); [console]::Beep(1046, 200) } catch {}
try {
    $headers = @{
        "Title"    = "Clinic Zone"
        "Priority" = "urgent"
        "Tags"     = "white_check_mark"
    }
    Invoke-RestMethod -Uri "https://ntfy.sh/clinic-zone-ahmed-2026" -Method Post -Headers $headers -Body "Task Completed - Pushed to GitHub" -TimeoutSec 15 | Out-Null
    Write-Host "ntfy sent successfully!"
} catch {
    Write-Host "ntfy error: $($_.Exception.Message)"
}
