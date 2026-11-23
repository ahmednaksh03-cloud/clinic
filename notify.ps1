# ============================================================
# NOTIFY.PS1 - Mobile Push Notification via ntfy.sh
# Clinic Zone Project
# ============================================================
$NTFY_TOPIC = "clinic-zone-ahmed-0938"

# Local PC beep
try {
    [console]::Beep(880, 200)
    [console]::Beep(1046, 200)
} catch {}

# Send instant push notification to mobile via ntfy.sh
if ($NTFY_TOPIC) {
    try {
        $url = "https://ntfy.sh/$NTFY_TOPIC"
        $arabicMsg = [Regex]::Unescape("\u062A\u0645 \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621 \u0645\u0646 \u0627\u0644\u0645\u0647\u0645\u0629 \u064A\u0627 \u062F\u0643\u062A\u0648\u0631 \u0623\u062D\u0645\u062F")
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($arabicMsg)
        $headers = @{
            "Title"    = "Clinic Zone - Task Completed"
            "Priority" = "high"
            "Tags"     = "white_check_mark"
        }
        $null = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $bodyBytes -ContentType "text/plain; charset=utf-8" -TimeoutSec 15
        Write-Host "Mobile notification sent via ntfy"
    } catch {
        Write-Warning "ntfy notification failed: $($_.Exception.Message)"
    }
}

Write-Host "`n=========================================="
Write-Host "TASK COMPLETED - CLINIC ZONE DEPLOYED"
Write-Host "=========================================="
Write-Host "Patient page: https://ahmednaksh03-cloud.github.io/clinic/patient.html"
Write-Host "Doctor dashboard: https://ahmednaksh03-cloud.github.io/clinic/doctor.html"
Write-Host "=========================================="
