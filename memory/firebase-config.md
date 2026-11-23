/* ==========================================
   Memory: Firebase configuration for Clinic Zone
   ========================================== */
---
name: firebase-config
description: Firebase Realtime Database configuration for Clinic Zone
metadata:
  type: project
---
Firebase App & Realtime Database v10 initialized with URL: https://clinic-zone-84536-default-rtdb.firebaseio.com
Booking path: /bookings/{bookingId}
Clinic state path: /clinic_state/current_queue
Prescriptions path: /prescriptions/{normalizedPhone}
Why: To enable real-time cloud synchronization across devices and live queue management.
How to apply: Include Firebase compat scripts and initialize Firebase in app.js.
