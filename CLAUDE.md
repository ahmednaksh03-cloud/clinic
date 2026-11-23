# Clinic Zone - Auto-Deploy Rules

## Project Overview
Clinic Zone medical clinic system with:
- `patient.html` - Patient booking page
- `doctor.html` - Doctor dashboard with real-time Firebase sync
- `style.css` - Shared stylesheet
- `app.js` - Firebase real-time logic, booking flow, dashboard
- `firebase-integration.js` - Firebase config reference

## Auto-Deploy Rule (MANDATORY)

**Whenever any of these files are modified: `patient.html`, `doctor.html`, `style.css`, `app.js`**

Automatically run this exact sequence:

```powershell
git add patient.html doctor.html style.css app.js
git commit -m "Update Clinic Zone"
git push origin main
```

Then confirm completion in Arabic with live links:
- Patient page: `https://ahmednaksh03-cloud.github.io/clinic/patient.html`
- Doctor dashboard: `https://ahmednaksh03-cloud.github.io/clinic/doctor.html`

## Git Setup (Run Once)
```powershell
git init
git branch -M main
git remote add origin https://github.com/ahmednaksh03-cloud/clinic.git
git fetch origin
git reset --mixed origin/main
git config user.name "Ahmed"
git config user.email "ahmednaksh03@gmail.com"
```

## Key Technical Details
- Firebase Realtime Database (compat v10)
- LocalStorage: `my_current_booking` for patient booking persistence
- Real-time listeners: `.on('value')` for live updates
- Cross-tab sync: BroadcastChannel + storage events
- Medical SVG emblem (cross + heartbeat) in headers & print template
- RTL Arabic with English "Clinic Zone" branding

## Mandatory Post-Task Workflow
After completing any task, IMMEDIATELY run git add -A, git commit, git push, and execute powershell -ExecutionPolicy Bypass -File .\notify.ps1 with ZERO delay (do NOT wait or sleep).
