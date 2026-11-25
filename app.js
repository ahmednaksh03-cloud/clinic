/* ==========================================
   APP.JS - CLINIC ZONE (Firebase Real-Time Sync)
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // FIREBASE CONFIGURATION
    // ==========================================
    const firebaseConfig = {
        databaseURL: "https://clinic-zone-84536-default-rtdb.firebaseio.com"
    };

    // Initialize Firebase (compat v10)
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // Reference paths
    const BOOKINGS_PATH = 'bookings';
    const QUEUE_PATH = 'clinic_state/current_queue';
    const PRESCRIPTIONS_PATH = 'prescriptions';

    // ==========================================
    // EMAILJS NOTIFICATION HELPER
    // ==========================================
    const EMAILJS_SERVICE_ID = 'service_ghdqi7p';
    const EMAILJS_TEMPLATE_ID = 'template_m1g99vm';
    const EMAILJS_PUBLIC_KEY = 'x-Mr2JNw2KIkUIduW';

    // Initialize EmailJS
    if (typeof emailjs !== 'undefined') {
        emailjs.init(EMAILJS_PUBLIC_KEY);
    }

    function sendEmailNotification(booking) {
        if (typeof emailjs === 'undefined') return;
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            patient_name: booking.name,
            patient_phone: booking.phone,
            booking_date: booking.date,
            booking_time: booking.time,
            visit_type: booking.visitType || '',
            notes: booking.notes || 'لا توجد ملاحظات',
            name: booking.name,
            email: 'ahmednaksh03@gmail.com',
            to_email: 'ahmednaksh03@gmail.com'
        }).then(res => console.log('EmailJS OK:', res.status))
          .catch(err => console.error('EmailJS Error:', err));
    }

    // ==========================================
    // DATE FORMATTING
    // ==========================================
    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    function formatTime(timeStr) {
        return timeStr || 'غير محدد';
    }

    // ==========================================
    // NOTIFICATION CHIME
    // ==========================================
    function playNotificationChime() {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.3);
    }

    // ==========================================
    // WHATSAPP HELPER (exposed globally for inline onclick)
    // ==========================================
    window.openWhatsApp = function(phone, msg) {
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;
        else if (!cleanPhone.startsWith('20') && cleanPhone.length === 10) cleanPhone = '20' + cleanPhone;
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    // ==========================================
    // SLOT LOCKING LOGIC
    // ==========================================
    function getBookingsForDate(dateStr) {
        return new Promise((resolve) => {
            const bookingsRef = database.ref(BOOKINGS_PATH);
            bookingsRef.orderByChild('date').equalTo(dateStr).once('value', (snapshot) => {
                const bookings = [];
                snapshot.forEach((child) => {
                    const data = child.val();
                    bookings.push({ id: child.key, ...data });
                });
                resolve(bookings);
            });
        });
    }

    function getActiveBookingsForDate(dateStr) {
        return getBookingsForDate(dateStr).then(bookings => {
            return bookings.filter(b => b.status !== 'ملغي' && b.status !== 'cancelled');
        });
    }

    // Safe fallback for live queue (defined globally so initPatientPage never throws ReferenceError)
    if (typeof window.initLiveQueue !== 'function') {
        window.initLiveQueue = function () {
            const queueEl = document.getElementById('queue-number');
            const banner = document.getElementById('live-queue-banner');
            if (!queueEl || !banner) return;

            // Read current queue from Firebase
            database.ref(QUEUE_PATH).on('value', (snapshot) => {
                const val = snapshot.val();
                queueEl.textContent = val || 1;
            });
        };
    }

    // ==========================================
    // SIDE DRAWER / HAMBURGER MENU
    // ==========================================
    function initSideDrawer() {
        const menuToggleBtn = document.getElementById('menu-toggle-btn');
        const drawerOverlay = document.getElementById('drawer-overlay');
        const sideDrawer = document.getElementById('side-drawer');
        const drawerCloseBtn = document.getElementById('drawer-close-btn');

        if (!menuToggleBtn || !drawerOverlay || !sideDrawer || !drawerCloseBtn) return;

        function openDrawer() {
            sideDrawer.classList.add('open');
            drawerOverlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        function closeDrawer() {
            sideDrawer.classList.remove('open');
            drawerOverlay.classList.add('hidden');
            document.body.style.overflow = '';
        }

        menuToggleBtn.addEventListener('click', openDrawer);
        drawerCloseBtn.addEventListener('click', closeDrawer);
        drawerOverlay.addEventListener('click', closeDrawer);

        // Close drawer on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sideDrawer.classList.contains('open')) {
                closeDrawer();
            }
        });
    }

    // ==========================================
    // PATIENT PAGE LOGIC
    // ==========================================
    if (document.body.classList.contains('patient-page')) {
        initPatientPage();
    }

    function initPatientPage() {
        const bookingForm = document.getElementById('patient-booking-form');
        const successBox = document.getElementById('patient-booking-success');
        const viewBookingBtn = document.getElementById('view-booking-btn');
        const detailsCard = document.getElementById('patient-booking-details');
        const cancelBtn = document.getElementById('cancel-my-booking-btn');
        const backBtn = document.getElementById('back-to-form-btn');
        const navViewBtn = document.getElementById('nav-view-booking-btn');
        const dateInput = document.getElementById('b-date');
        const submitBtn = document.getElementById('submit-booking-btn');
        const liveQueueBanner = document.getElementById('live-queue-banner');
        const queueNumberEl = document.getElementById('queue-number');

        // Set min date to today and run slot locking on load
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.min = today;
            dateInput.value = today;

            // Initial slot locking check for today
            getActiveBookingsForDate(today).then(activeBookings => {
                disableBookedSlots(activeBookings);
            }).catch(err => console.error('Error on initial slot locking:', err));
        }

        // Initialize live queue
        initLiveQueue();

        // Live slot locking on date change
        if (dateInput) {
            dateInput.addEventListener('change', async () => {
                const selectedDate = dateInput.value;
                if (!selectedDate) return;

                try {
                    const activeBookings = await getActiveBookingsForDate(selectedDate);
                    disableBookedSlots(activeBookings);
                } catch (err) {
                    console.error('Error checking bookings for slot locking:', err);
                }
            });
        }

        function disableBookedSlots(bookedSlots) {
            const timeSelect = document.getElementById('b-time');
            if (!timeSelect) return;

            // Store current options
            const currentOptions = [];
            for (let i = 0; i < timeSelect.options.length; i++) {
                currentOptions.push(timeSelect.options[i].value);
            }

            // Disable booked slots
            timeSelect.innerHTML = '';
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'اختر التوقيت';
            timeSelect.appendChild(defaultOption);

            const allSlots = [
                '04:00 مساءً', '04:30 مساءً', '05:00 مساءً', '05:30 مساءً',
                '06:00 مساءً', '06:30 مساءً', '07:00 مساءً', '07:30 مساءً',
                '08:00 مساءً', '08:30 مساءً', '09:00 مساءً', '09:30 مساءً'
            ];

            allSlots.forEach(slot => {
                const isBooked = bookedSlots.some(b => b.time === slot);
                const option = document.createElement('option');
                option.value = slot;
                option.textContent = slot;
                option.disabled = isBooked;
                if (isBooked) {
                    option.style.color = '#ef4444';
                    option.style.fontWeight = '700';
                }
                timeSelect.appendChild(option);
            });

            // Re-add the options that were previously selected
            currentOptions.forEach(optVal => {
                const existing = timeSelect.querySelector(`option[value="${optVal}"]`);
                if (existing && !existing.disabled) {
                    existing.selected = true;
                }
            });
        }

        // Check for existing booking on load
        checkExistingBooking();

        if (bookingForm) {
            bookingForm.addEventListener('submit', (e) => {
                e.preventDefault();

                const bookingData = {
                    id: 'BK-' + Date.now().toString().slice(-6),
                    name: document.getElementById('b-name').value.trim(),
                    phone: document.getElementById('b-phone').value.trim(),
                    date: document.getElementById('b-date').value,
                    time: document.getElementById('b-time').value,
                    visitType: document.getElementById('b-visit-type').value,
                    notes: document.getElementById('b-notes').value.trim() || 'لا توجد ملاحظات',
                    status: 'قيد الانتظار',
                    timestamp: new Date().toISOString()
                };

                // Save to Firebase
                const bookingsRef = database.ref(BOOKINGS_PATH);
                bookingsRef.child(bookingData.id).set(bookingData).then(() => {
                    // Play notification chime
                    playNotificationChime();

                    // Send email notification
                    sendEmailNotification(bookingData);

                    // Broadcast to other tabs
                    const bc = new BroadcastChannel('clinic_zone_sync');
                    bc.postMessage('new-booking');

                    // Also send structured message with full booking data
                    const structuredBc = new BroadcastChannel('clinic_zone_sync');
                    structuredBc.postMessage({
                        type: 'new-booking-full',
                        booking: bookingData
                    });

                    // Save booking reference to localStorage
                    localStorage.setItem('my_current_booking', JSON.stringify({
                        id: bookingData.id,
                        name: bookingData.name,
                        phone: bookingData.phone
                    }));

                    // Show Success
                    bookingForm.classList.add('hidden');
                    successBox.classList.remove('hidden');
                    navViewBtn.classList.remove('hidden');

                    // Attach real-time listener for status updates
                    const bookingRef = database.ref(BOOKINGS_PATH).child(bookingData.id);
                    bookingRef.on('value', (snapshot) => {
                        const booking = snapshot.val();
                        if (booking) {
                            const statusEl = document.getElementById('det-status');
                            if (statusEl) {
                                statusEl.textContent = booking.status;
                                statusEl.className = 'status-badge ' +
                                    (booking.status === 'مؤكد' ? 'status-confirmed' :
                                     booking.status === 'ملغي' ? 'status-cancelled' : 'status-pending');
                            }
                        }
                    });

                    // Check existing booking for slot locking
                    checkExistingBooking();
                }).catch(err => {
                    console.error('Firebase error:', err);
                    alert('حدث خطأ في حفظ الحجز. يرجى المحاولة مرة أخرى.');
                });
            });
        }

        // View Booking from success message
        if (viewBookingBtn) {
            viewBookingBtn.addEventListener('click', showMyBooking);
        }

        // View Booking from nav button
        if (navViewBtn) {
            navViewBtn.addEventListener('click', showMyBooking);
        }

        // Cancel booking
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (!confirm('هل أنت متأكد من إلغاء هذا الحجز؟')) return;
                const stored = localStorage.getItem('my_current_booking');
                if (stored) {
                    const { id } = JSON.parse(stored);
                    database.ref(BOOKINGS_PATH).child(id).update({ status: 'ملغي' }).then(() => {
                        localStorage.removeItem('my_current_booking');
                        showForm();
                    }).catch(err => console.error('Error cancelling booking:', err));
                }
            });
        }

        // Back to form
        if (backBtn) {
            backBtn.addEventListener('click', showForm);
        }

        function showForm() {
            const form = document.getElementById('patient-booking-form');
            const successBox = document.getElementById('patient-booking-success');
            const detailsCard = document.getElementById('patient-booking-details');
            const navViewBtn = document.getElementById('nav-view-booking-btn');

            form.reset();
            successBox.classList.add('hidden');
            detailsCard.classList.add('hidden');
            form.classList.remove('hidden');
            navViewBtn.classList.add('hidden');
            localStorage.removeItem('my_current_booking');
        }

        function showMyBooking() {
            const stored = localStorage.getItem('my_current_booking');
            if (!stored) {
                alert('لا يوجد حجز حالي لعرضه.');
                return;
            }
            const { id, name, phone } = JSON.parse(stored);

            const bookingsRef = database.ref(BOOKINGS_PATH);
            bookingsRef.child(id).once('value', (snapshot) => {
                const booking = snapshot.val();

                if (booking) {
                    // Populate details card
                    document.getElementById('det-name').textContent = booking.name;
                    document.getElementById('det-phone').textContent = booking.phone;
                    document.getElementById('det-date').textContent = formatDate(booking.date);
                    document.getElementById('det-time').textContent = booking.time;
                    document.getElementById('det-type').textContent = booking.visitType;

                    const statusEl = document.getElementById('det-status');
                    statusEl.textContent = booking.status;
                    statusEl.className = 'status-badge ' +
                        (booking.status === 'مؤكد' ? 'status-confirmed' :
                         booking.status === 'ملغي' ? 'status-cancelled' : 'status-pending');

                    // Scroll to booking details with smooth behavior
                    const detailsCard = document.getElementById('patient-booking-details');
                    detailsCard.scrollIntoView({ behavior: 'smooth' });

                    successBox.classList.add('hidden');
                    detailsCard.classList.remove('hidden');
                } else {
                    alert('تعذر تحميل تفاصيل الحجز.');
                }
            });
        }

        function checkExistingBooking() {
            const stored = localStorage.getItem('my_current_booking');
            if (!stored) return;

            const { id, name, phone } = JSON.parse(stored);
            const bookingsRef = database.ref(BOOKINGS_PATH);
            bookingsRef.child(id).once('value', (snapshot) => {
                const booking = snapshot.val();

                if (booking && booking.name === name && booking.phone === phone) {
                    navViewBtn.classList.remove('hidden');
                } else {
                    localStorage.removeItem('my_current_booking');
                }
            });
        }

        function updateLiveQueueOnNewBooking() {
            // Read current queue and increment if needed
            database.ref(QUEUE_PATH).transaction(current => {
                return (current || 1) + 1;
            });
        }

        // ==========================================
        // LIVE STATUS LISTENER FOR PATIENT PAGE (Fix 3)
        // ==========================================
        // Attach real-time listener on /bookings/{id} when my_current_booking exists
        const storedBooking = localStorage.getItem('my_current_booking');
        if (storedBooking) {
            try {
                const { id } = JSON.parse(storedBooking);
                const bookingRef = database.ref(BOOKINGS_PATH).child(id);
                bookingRef.on('value', (snapshot) => {
                    const booking = snapshot.val();
                    if (booking) {
                        const statusEl = document.getElementById('det-status');
                        if (statusEl) {
                            statusEl.textContent = booking.status;
                            statusEl.className = 'status-badge ' +
                                (booking.status === 'مؤكد' ? 'status-confirmed' :
                                 booking.status === 'ملغي' ? 'status-cancelled' : 'status-pending');
                        }
                    }
                });
            } catch (e) {
                console.error('Error setting up live status listener:', e);
            }
        }
    }

    // ==========================================
    // MEDICAL HISTORY MODAL FUNCTIONS (Global)
    // ==========================================
    window.openMedicalHistoryModal = function(patientName, patientPhone) {
        const modal = document.getElementById('medical-history-modal');
        const nameEl = document.getElementById('mh-patient-name');
        const phoneEl = document.getElementById('mh-patient-phone');
        const countEl = document.getElementById('mh-patient-count');

        if (modal && nameEl && phoneEl) {
            nameEl.textContent = patientName;
            phoneEl.textContent = patientPhone;
            modal.classList.remove('hidden');

            // Load prescription history
            loadPrescriptionHistory(patientName, patientPhone);
            // Load booking history
            loadBookingHistory(patientName, patientPhone);

            // Tab switching
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                    btn.classList.add('active');
                    document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
                });
            });
        }
    };

    window.closeMedicalHistoryModal = function() {
        const modal = document.getElementById('medical-history-modal');
        if (modal) modal.classList.add('hidden');
    };

    function normalizePhone(phone) {
        let clean = phone.replace(/\D/g, '');
        if (clean.startsWith('01')) clean = clean.substring(1);
        if (clean.startsWith('20')) clean = clean.substring(2);
        return clean;
    }

    function loadPrescriptionHistory(patientName, patientPhone) {
        const container = document.getElementById('prescriptions-list');
        if (!container) return;

        const normalizedPhone = normalizePhone(patientPhone);
        const prescRef = database.ref(PRESCRIPTIONS_PATH).child(normalizedPhone);

        prescRef.once('value', (snapshot) => {
            const prescriptions = [];
            snapshot.forEach((child) => {
                const data = child.val();
                prescriptions.push({ id: child.key, ...data });
            });

            if (prescriptions.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">لا توجد وصفات طبية سابقة لهذه المريضة</div>';
                document.getElementById('mh-patient-count').textContent = '٠ وصفات';
                return;
            }

            // Sort by date descending
            prescriptions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            document.getElementById('mh-patient-count').textContent = prescriptions.length + ' وصفات';

            container.innerHTML = '';
            prescriptions.forEach(p => {
                const date = new Date(p.timestamp).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                const div = document.createElement('div');
                div.className = 'prescription-item';
                div.innerHTML = `
                    <div class="presc-item-header">
                        <span class="presc-item-date">${date}</span>
                        <div class="presc-item-actions">
                            <button class="btn btn-outline btn-sm" onclick="reprintPrescription('${normalizedPhone}', '${p.id}')"><i class="fa-solid fa-print"></i> إعادة طباعة</button>
                            <button class="btn btn-whatsapp btn-sm" onclick="resendPrescriptionWhatsApp('${patientPhone}', '${p.id}')"><i class="fa-brands fa-whatsapp"></i> إرسال واتساب</button>
                        </div>
                    </div>
                    <div class="presc-item-diagnosis"><strong>التشخيص:</strong> ${p.diagnosis || 'غير محدد'}</div>
                    <div class="presc-item-meds">${p.meds || 'لا توجد أدوية'}</div>
                `;
                container.appendChild(div);
            });
        });
    }

    function loadBookingHistory(patientName, patientPhone) {
        const container = document.getElementById('bookings-list');
        if (!container) return;

        const bookingsRef = database.ref(BOOKINGS_PATH);
        bookingsRef.orderByChild('timestamp').once('value', (snapshot) => {
            const bookings = [];
            snapshot.forEach((child) => {
                const data = child.val();
                if (data.name === patientName && data.phone === patientPhone) {
                    bookings.push({ id: child.key, ...data });
                }
            });

            if (bookings.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">لا توجد حجوزات سابقة لهذه المريضة</div>';
                return;
            }

            // Sort by date descending
            bookings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            container.innerHTML = '';
            bookings.forEach(b => {
                const statusClass = b.status === 'مؤكد' ? 'status-confirmed' :
                                    (b.status === 'ملغي' || b.status === 'cancelled' ? 'status-cancelled' : 'status-pending');
                const dateParts = b.date.split('-');
                const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

                const div = document.createElement('div');
                div.className = 'booking-history-item';
                div.innerHTML = `
                    <div class="booking-history-info">
                        <span class="booking-history-date">${formattedDate} - ${b.time}</span>
                        <span class="booking-history-type">${b.visitType}</span>
                    </div>
                    <span class="status-badge ${statusClass}">${b.status}</span>
                `;
                container.appendChild(div);
            });
        });
    }

    window.reprintPrescription = function(normalizedPhone, prescriptionId) {
        const prescRef = database.ref(PRESCRIPTIONS_PATH).child(normalizedPhone).child(prescriptionId);
        prescRef.once('value', (snapshot) => {
            const p = snapshot.val();
            if (p) {
                document.getElementById('p-print-name').innerText = p.name;
                document.getElementById('p-print-date').innerText = new Date(p.timestamp).toLocaleDateString('ar-EG');
                document.getElementById('p-print-diagnosis').innerText = p.diagnosis || 'حالة طبية عامة';
                document.getElementById('p-print-meds').innerText = p.meds;
                // Generate QR code
                generatePrescriptionQR();
                window.print();
            }
        });
    };

    window.resendPrescriptionWhatsApp = function(phone, prescriptionId) {
        const normalizedPhone = normalizePhone(phone);
        const prescRef = database.ref(PRESCRIPTIONS_PATH).child(normalizedPhone).child(prescriptionId);
        prescRef.once('value', (snapshot) => {
            const p = snapshot.val();
            if (p) {
                const msg = `روشتة طبية من كلينيك زون\nالمريضة: ${p.name}\nالتشخيص: ${p.diagnosis || 'حالة طبية عامة'}\nالأدوية:\n${p.meds}\nمع تمنياتنا بالشفاء العاجل.`;
                openWhatsApp(phone, msg);
            }
        });
    };

    function generatePrescriptionQR() {
        const qrImg = document.getElementById('prescription-qr');
        if (qrImg) {
            qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=https://ahmednaksh03-cloud.github.io/clinic/patient.html';
        }
    }

    // ==========================================
    // DOCTOR PAGE LOGIC
    // ==========================================
    if (document.body.classList.contains('doctor-page')) {
        initDoctorPage();
    }

    function initDoctorPage() {
        const loginOverlay = document.getElementById('doctor-login-overlay');
        const loginForm = document.getElementById('doctor-login-form');
        const logoutBtn = document.getElementById('doctor-logout-btn');
        const refreshBtn = document.getElementById('refresh-data-btn');
        const prescNameSelect = document.getElementById('presc-name');
        const prescPhoneInput = document.getElementById('presc-phone');
        const prescMedsArea = document.getElementById('presc-meds');
        const medChips = document.querySelectorAll('.med-chip');

        // Populate patient dropdown with unique names from window.allBookings
        function populatePatientDropdown() {
            if (!prescNameSelect) return;
            const bookings = window.allBookings || [];

            // Get unique patients by name+phone
            const uniquePatients = [];
            const seen = new Set();
            bookings.forEach(b => {
                const key = b.name + '|' + b.phone;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniquePatients.push({ name: b.name, phone: b.phone, id: b.id });
                }
            });

            // Preserve currently selected value
            const currentValue = prescNameSelect.value;

            // Clear and repopulate
            prescNameSelect.innerHTML = '<option value="" disabled selected>اختر مريضة من الجدول</option>';
            uniquePatients.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.dataset.phone = p.phone;
                opt.dataset.id = p.id;
                opt.textContent = p.name;
                prescNameSelect.appendChild(opt);
            });

            // Restore selection if still valid
            if (currentValue && uniquePatients.some(p => p.name === currentValue)) {
                prescNameSelect.value = currentValue;
                if (prescPhoneInput) {
                    prescPhoneInput.value = uniquePatients.find(p => p.name === currentValue).phone;
                }
            }
        }

        // Render Dashboard with direct real-time Firebase listener
        window.renderDashboard = function() {
            if (!document.body.classList.contains('doctor-page')) return;

            database.ref(BOOKINGS_PATH).on('value', (snapshot) => {
                const bookings = [];
                if (snapshot.exists()) {
                    snapshot.forEach((child) => {
                        const data = child.val();
                        bookings.push({ id: child.key, ...data });
                    });
                }

                window.allBookings = bookings;

                // Update Stat Cards
                const statTotal = document.getElementById('stat-total');
                if (statTotal) statTotal.innerText = bookings.length;

                const statPending = document.getElementById('stat-pending');
                if (statPending) statPending.innerText = bookings.filter(b => b.status === 'قيد الانتظار').length;

                const statConfirmed = document.getElementById('stat-confirmed');
                if (statConfirmed) statConfirmed.innerText = bookings.filter(b => b.status === 'مؤكد').length;

                const statFollowup = document.getElementById('stat-followup');
                if (statFollowup) statFollowup.innerText = bookings.filter(b => b.visitType && b.visitType.includes('متابعة')).length;

                // Populate patient dropdown
                populatePatientDropdown();

                // Apply filters and render table
                applyBookingFilters(window.allBookings);
            });
        };

        // Check Login State
        if (sessionStorage.getItem('doctor_logged_in') === 'true') {
            loginOverlay.classList.add('hidden');
            renderDashboard();
        }

        // Initialize Side Drawer
        initSideDrawer();

        // Initialize new modals
        initEditPatientPageModal();
        initManageDashboardModal();
        initAccountSettingsModal();
        initContactClinicZoneModal();
        initClinicCodeModal();

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const pwd = document.getElementById('login-password').value;
                if (pwd === '1234') {
                    sessionStorage.setItem('doctor_logged_in', 'true');
                    loginOverlay.classList.add('hidden');
                    renderDashboard();
                } else {
                    document.getElementById('login-error').classList.remove('hidden');
                }
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                sessionStorage.removeItem('doctor_logged_in');
                location.reload();
            });
        }

        // Refresh button
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                location.reload(true);
            });
        }

        // Auto-fill phone when patient selected from dropdown
        if (prescNameSelect) {
            prescNameSelect.addEventListener('change', () => {
                const selectedOption = prescNameSelect.options[prescNameSelect.selectedIndex];
                if (selectedOption && selectedOption.dataset.phone) {
                    prescPhoneInput.value = selectedOption.dataset.phone;
                } else {
                    prescPhoneInput.value = '';
                }
            });
        }

        // Medication chips - append to presc-meds on new line
        medChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const med = chip.getAttribute('data-med');
                const currentVal = prescMedsArea.value;
                prescMedsArea.value = currentVal + (currentVal ? '\n' : '') + med + ': ';
                prescMedsArea.focus();
            });
        });

        // Prescription print and save
        document.getElementById('print-presc-btn').addEventListener('click', () => {
            const name = prescNameSelect.value;
            const phone = prescPhoneInput.value;
            const meds = prescMedsArea.value;
            const diagnosis = document.getElementById('presc-diagnosis').value;

            if (!name || !meds) return alert('يرجى إدخال اسم المريضة والأدوية أولاً');

            // Save to Firebase prescriptions
            const prescriptionData = {
                name: name,
                phone: phone,
                diagnosis: diagnosis || 'حالة طبية عامة',
                meds: meds,
                timestamp: new Date().toISOString()
            };

            const normalizedPhone = normalizePhone(phone);
            const prescRef = database.ref(PRESCRIPTIONS_PATH).child(normalizedPhone);
            prescRef.push(prescriptionData).then(() => {
                // Play notification chime
                playNotificationChime();

                // Broadcast to other tabs
                const bc = new BroadcastChannel('clinic_zone_sync');
                bc.postMessage('new-prescription');

                // Update print area and print
                document.getElementById('p-print-name').innerText = name;
                document.getElementById('p-print-date').innerText = new Date().toLocaleDateString('ar-EG');
                document.getElementById('p-print-diagnosis').innerText = diagnosis || 'حالة طبية عامة';
                document.getElementById('p-print-meds').innerText = meds;

                // Generate QR code
                generatePrescriptionQR();

                window.print();

                // Update prescription dropdown if modal is open
                if (!document.getElementById('medical-history-modal').classList.contains('hidden')) {
                    const patientName = document.getElementById('mh-patient-name').textContent;
                    const patientPhone = document.getElementById('mh-patient-phone').textContent;
                    if (patientName === name && patientPhone === phone) {
                        loadPrescriptionHistory(patientName, patientPhone);
                    }
                }
            }).catch(err => {
                console.error('Error saving prescription:', err);
                alert('حدث خطأ في حفظ الروشتة');
            });
        });

        // Medical History Modal: Print Full Record button
        const printFullRecordBtn = document.getElementById('print-full-record-btn');
        if (printFullRecordBtn) {
            printFullRecordBtn.addEventListener('click', () => {
                const patientName = document.getElementById('mh-patient-name').textContent;
                const patientPhone = document.getElementById('mh-patient-phone').textContent;
                if (!patientName || !patientPhone) return;

                const normalizedPhone = normalizePhone(patientPhone);
                const prescRef = database.ref(PRESCRIPTIONS_PATH).child(normalizedPhone);

                prescRef.once('value', (snapshot) => {
                    const prescriptions = [];
                    snapshot.forEach((child) => {
                        const data = child.val();
                        prescriptions.push({ id: child.key, ...data });
                    });

                    if (prescriptions.length === 0) {
                        alert('لا توجد وصفات طبية للطباعة');
                        return;
                    }

                    // Sort by date ascending (chronological)
                    prescriptions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

                    // Build combined medical record content
                    let combinedDiagnosis = '';
                    let combinedMeds = '';
                    let visitCount = 1;

                    prescriptions.forEach(p => {
                        const date = new Date(p.timestamp).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        combinedDiagnosis += `--- زيارة ${visitCount} (${date}) ---\n${p.diagnosis || 'غير محدد'}\n\n`;
                        combinedMeds += `--- زيارة ${visitCount} (${date}) ---\n${p.meds || 'لا توجد أدوية'}\n\n`;
                        visitCount++;
                    });

                    // Populate print area with complete record
                    document.getElementById('p-print-name').innerText = patientName;
                    document.getElementById('p-print-date').innerText = new Date().toLocaleDateString('ar-EG');
                    document.getElementById('p-print-diagnosis').innerText = combinedDiagnosis.trim();
                    document.getElementById('p-print-meds').innerText = combinedMeds.trim();

                    // Generate QR code
                    generatePrescriptionQR();

                    // Print
                    window.print();
                }).catch(err => {
                    console.error('Error loading prescriptions for full record:', err);
                    alert('حدث خطأ في تحميل السجل الطبي');
                });
            });
        }

        // Medical History Modal: New Prescription button
        const newPrescriptionBtn = document.getElementById('new-prescription-btn');
        if (newPrescriptionBtn) {
            newPrescriptionBtn.addEventListener('click', () => {
                const patientName = document.getElementById('mh-patient-name').textContent;
                const patientPhone = document.getElementById('mh-patient-phone').textContent;
                if (!patientName || !patientPhone) return;

                // Close modal
                closeMedicalHistoryModal();

                // Select patient in prescription dropdown
                const prescNameSelect = document.getElementById('presc-name');
                const prescPhoneInput = document.getElementById('presc-phone');
                if (prescNameSelect) {
                    prescNameSelect.value = patientName;
                    prescNameSelect.dispatchEvent(new Event('change'));
                }
                if (prescPhoneInput) {
                    prescPhoneInput.value = patientPhone;
                }

                // Scroll to prescription section
                document.getElementById('prescription-section').scrollIntoView({ behavior: 'smooth' });
            });
        }

        document.getElementById('whatsapp-presc-btn').addEventListener('click', () => {
            const name = prescNameSelect.value;
            const phone = prescPhoneInput.value;
            const meds = prescMedsArea.value;
            const diagnosis = document.getElementById('presc-diagnosis').value;

            if (!name || !phone || !meds) return alert('البيانات غير مكتملة للإرسال');

            const msg = `روشتة طبية من كلينيك زون\nالمريضة: ${name}\nالتشخيص: ${diagnosis || 'حالة طبية عامة'}\nالأدوية:\n${meds}\nمع تمنياتنا بالشفاء العاجل.`;
            openWhatsApp(phone, msg);
        });

        // ==========================================
        // REAL-TIME CROSS-TAB SYNC LISTENERS
        // ==========================================
        // Listen for booking status changes from patient page
        const bc = new BroadcastChannel('clinic_zone_sync');
        bc.onmessage = (event) => {
            // Handle both string messages and structured object messages
            if (event.data === 'new-booking' || event.data === 'refresh') {
                if (window.renderDashboard) {
                    window.renderDashboard();
                }
            } else if (event.data && event.data.type === 'new-booking-full') {
                // Handle structured booking data message
                if (event.data && event.data.booking && window.renderDashboard) {
                    // Pre-load the booking data into localStorage for quick access
                    const booking = event.data.booking;
                    localStorage.setItem('my_current_booking', JSON.stringify({
                        id: booking.id,
                        name: booking.name,
                        phone: booking.phone
                    }));
                    // Re-render the dashboard to show the new booking
                    if (window.renderDashboard) {
                        window.renderDashboard();
                    }
                }
            }
        };

        // Storage event listener for cross-tab sync
        window.addEventListener('storage', (e) => {
            if (e.key === 'my_current_booking') {
                if (window.renderDashboard) {
                    window.renderDashboard();
                }
            }
        });

        // Search and filter functionality
        function applyBookingFilters(bookings) {
            const searchInput = document.getElementById('search-patient');
            const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

            const filterAll = document.getElementById('filter-all');
            const filterToday = document.getElementById('filter-today');
            const filterPending = document.getElementById('filter-pending');

            let activeFilter = 'all';
            if (filterToday?.classList.contains('btn-primary')) activeFilter = 'today';
            else if (filterPending?.classList.contains('btn-primary')) activeFilter = 'pending';

            let filtered = bookings;

            // Apply search filter
            if (searchTerm) {
                filtered = filtered.filter(b =>
                    b.name.toLowerCase().includes(searchTerm) ||
                    b.phone.includes(searchTerm)
                );
            }

            // Apply status/date filter
            const todayStr = new Date().toISOString().split('T')[0];
            if (activeFilter === 'today') {
                filtered = filtered.filter(b => b.date === todayStr);
            } else if (activeFilter === 'pending') {
                filtered = filtered.filter(b => b.status === 'قيد الانتظار');
            }

            renderBookingsTable(filtered);
        }

        function renderBookingsTable(bookings) {
            const tbody = document.getElementById('bookings-table-body');
            tbody.innerHTML = '';

            const minRowHeight = 5;

            if (bookings.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td colspan="6" style="text-align: center; padding: 2rem; color: var(--muted);">لا توجد حجوزات مطابقة</td>`;
                tbody.appendChild(tr);
                tbody.style.minHeight = `${minRowHeight * 50}px`;
                return;
            }

            tbody.style.minHeight = 'auto';
            const calculatedMinHeight = Math.max(bookings.length * 38 + 20, minRowHeight * 50);
            tbody.style.minHeight = `${calculatedMinHeight}px`;

            bookings.forEach(b => {
                const statusClass = b.status === 'مؤكد' ? 'status-confirmed' :
                                    (b.status === 'ملغي' || b.status === 'cancelled' ? 'status-cancelled' : 'status-pending');

                // Format phone with WhatsApp prefix (guard against null/undefined)
                let displayPhone = String(b?.phone || '');
                if (displayPhone.startsWith('01')) displayPhone = '20' + displayPhone.slice(2);

                // Format date display (guard against null/undefined)
                const dateParts = String(b?.date || '').split('-');
                const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : (b?.date || '');

                const tr = document.createElement('tr');

                tr.innerHTML = `
                    <td><strong>${b.name}</strong></td>
                    <td>${formattedDate}<br><small>${b.time}</small></td>
                    <td><span style="color:var(--primary-dark); font-weight:700;">${b.visitType}</span></td>
                    <td><a href="#" onclick="openWhatsApp('${b.phone}', 'مرحباً ${b.name}، نود تأكيد حجزك في كلينيك زون'); return false;">${displayPhone}</a></td>
                    <td><span class="status-badge ${statusClass}">${b.status}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn btn-confirm" onclick="updateBookingStatus('${b.id}', 'مؤكد')" title="تأكيد"><i class="fa-solid fa-check"></i></button>
                            <button class="action-btn btn-cancel" onclick="updateBookingStatus('${b.id}', 'ملغي')" title="إلغاء"><i class="fa-solid fa-xmark"></i></button>
                            <button class="action-btn btn-whatsapp" onclick="openWhatsApp('${b.phone}', 'مرحباً ${b.name}')"><i class="fa-brands fa-whatsapp"></i></button>
                            <button class="action-btn btn-primary" onclick="selectForRx('${b.id}')" style="width:auto; padding:0 10px;" title="روشتة">روشتة</button>
                            <button class="action-btn btn-secondary" onclick="openMedicalHistoryModal('${b.name}', '${b.phone}')" style="width:auto; padding:0 10px;" title="السجل الطبي"><i class="fa-solid fa-file-medical"></i></button>
                            <button class="action-btn btn-danger" onclick="deleteBooking('${b.id}')" title="حذف" style="background: var(--danger); border-color: var(--danger); width:auto; padding:0 10px;"> حذف </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Initialize search and filter event listeners
        function initSearchAndFilters() {
            const searchInput = document.getElementById('search-patient');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    if (window.allBookings) {
                        applyBookingFilters(window.allBookings);
                    }
                });
            }

            const filterAll = document.getElementById('filter-all');
            const filterToday = document.getElementById('filter-today');
            const filterPending = document.getElementById('filter-pending');

            function setActiveFilter(btn) {
                [filterAll, filterToday, filterPending].forEach(b => {
                    if (b) {
                        b.classList.remove('btn-primary');
                        b.classList.add('btn-outline');
                    }
                });
                if (btn) {
                    btn.classList.remove('btn-outline');
                    btn.classList.add('btn-primary');
                }
                if (window.allBookings) {
                    applyBookingFilters(window.allBookings);
                }
            }

            if (filterAll) filterAll.addEventListener('click', () => setActiveFilter(filterAll));
            if (filterToday) filterToday.addEventListener('click', () => setActiveFilter(filterToday));
            if (filterPending) filterPending.addEventListener('click', () => setActiveFilter(filterPending));

            // Set default active filter
            if (filterAll) {
                filterAll.classList.remove('btn-outline');
                filterAll.classList.add('btn-primary');
            }
        }

        // Update booking status in Firebase
        window.updateBookingStatus = function(id, newStatus) {
            const bookingsRef = database.ref(BOOKINGS_PATH);
            bookingsRef.child(id).update({ status: newStatus }).then(() => {
                // Play notification chime
                playNotificationChime();

                // Broadcast to update patient page
                const bc = new BroadcastChannel('clinic_zone_sync');
                bc.postMessage('refresh');

                // Re-render dashboard
                if (window.renderDashboard) {
                    window.renderDashboard();
                }
            }).catch(err => console.error('Error updating booking status:', err));
        };

        // Delete booking from Firebase
        window.deleteBooking = function(id) {
            if (!confirm('هل أنت متأكد من حذف هذا الحجز؟ هذا سيحرر الوقت المحجوز.')) return;

            const bookingsRef = database.ref(BOOKINGS_PATH);
            bookingsRef.child(id).remove().then(() => {
                // Play notification chime
                playNotificationChime();

                // Broadcast to update
                const bc = new BroadcastChannel('clinic_zone_sync');
                bc.postMessage('refresh');

                // Re-render dashboard
                if (window.renderDashboard) {
                    window.renderDashboard();
                }

                // Show success message
                alert('تم حذف الحجز بنجاح and تم تحرير الوقت.');
            }).catch(err => console.error('Error deleting booking:', err));
        };

        // Select patient for prescription / open medical history modal
        window.selectForRx = function(id) {
            const bookingsRef = database.ref(BOOKINGS_PATH);
            bookingsRef.child(id).once('value', (snapshot) => {
                const booking = snapshot.val();
                if (booking) {
                    const prescNameSelect = document.getElementById('presc-name');
                    const prescPhoneInput = document.getElementById('presc-phone');
                    if (prescNameSelect) {
                        prescNameSelect.value = booking.name;
                        // Trigger change event to auto-fill phone
                        prescNameSelect.dispatchEvent(new Event('change'));
                    }
                    if (prescPhoneInput) {
                        prescPhoneInput.value = booking.phone;
                    }
                    // Open medical history modal for this patient
                    if (typeof openMedicalHistoryModal === 'function') {
                        openMedicalHistoryModal(booking.name, booking.phone);
                    }
                    document.getElementById('prescription-section').scrollIntoView();
                }
            });
        };

        // Initialize search and filters
        initSearchAndFilters();
    }

    // ==========================================
    // DOCTOR IMAGE FALLBACK
    // ==========================================
    window.handleDoctorImgFallback = function(img) {
        const fallbacks = ['doctor.jpeg', 'doctor.jpg', 'doctor.png'];
        const current = img.src.split('/').pop();
        const nextIndex = fallbacks.indexOf(current) + 1;

        if (nextIndex < fallbacks.length) {
            img.src = fallbacks[nextIndex];
        } else {
            const parent = img.parentElement;
            parent.innerHTML = '<i class="fa-solid fa-user-doctor" style="font-size: 4rem; color: var(--primary);"></i>';
        }
    };

    // ==========================================
    // EDIT PATIENT PAGE MODAL
    // ==========================================
    function initEditPatientPageModal() {
        const modal = document.getElementById('edit-patient-page-modal');
        const editMenuItem = document.getElementById('drawer-edit-patient-page');
        if (editMenuItem) {
            editMenuItem.addEventListener('click', (e) => {
                e.preventDefault();
                openEditPatientModal();
            });
        }

        function openEditPatientModal() {
            if (modal) {
                modal.classList.remove('hidden');
                loadPatientPageDraft();
            }
        }

        window.closeEditPatientModal = function() {
            if (modal) modal.classList.add('hidden');
        };

        // Tab switching
        modal?.querySelectorAll('.edit-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.edit-tab-btn').forEach(b => b.classList.remove('active'));
                modal.querySelectorAll('.edit-tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
            });
        });

        // Add working hours entry
        const addHoursBtn = document.getElementById('add-hours-btn');
        if (addHoursBtn) {
            addHoursBtn.addEventListener('click', () => {
                const container = document.getElementById('working-hours-container');
                const entry = document.createElement('div');
                entry.className = 'working-hours-entry';
                entry.innerHTML = `
                    <div class="form-group">
                        <label>اليوم</label>
                        <select>
                            <option value="السبت">السبت</option>
                            <option value="الأحد">الأحد</option>
                            <option value="الإثنين">الإثنين</option>
                            <option value="الثلاثاء">الثلاثاء</option>
                            <option value="الأربعاء">الأربعاء</option>
                            <option value="الخميس">الخميس</option>
                            <option value="الجمعة">الجمعة</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>من</label>
                        <input type="time" step="1800">
                    </div>
                    <div class="form-group">
                        <label>إلى</label>
                        <input type="time" step="1800">
                    </div>
                    <button class="remove-entry-btn" title="حذف"><i class="fa-solid fa-trash-can"></i></button>
                `;
                container.appendChild(entry);
                entry.querySelector('.remove-entry-btn').addEventListener('click', () => entry.remove());
            });
        }

        // Add address entry
        const addAddressBtn = document.getElementById('add-address-btn');
        if (addAddressBtn) {
            addAddressBtn.addEventListener('click', () => {
                const container = document.getElementById('addresses-container');
                const entry = document.createElement('div');
                entry.className = 'address-entry';
                entry.innerHTML = `
                    <div class="form-group" style="grid-column: span 3;">
                        <label>العنوان</label>
                        <input type="text" placeholder="مثال: شارع الجمهورية - برج الأطباء التخصصي - الدور الثالث">
                    </div>
                    <button class="remove-entry-btn" title="حذف"><i class="fa-solid fa-trash-can"></i></button>
                `;
                container.appendChild(entry);
                entry.querySelector('.remove-entry-btn').addEventListener('click', () => entry.remove());
            });
        }

        // Add service entry
        const addServiceBtn = document.getElementById('add-service-btn');
        if (addServiceBtn) {
            addServiceBtn.addEventListener('click', () => {
                const container = document.getElementById('services-container');
                const entry = document.createElement('div');
                entry.className = 'service-entry';
                entry.innerHTML = `
                    <div class="form-group">
                        <label>اسم الخدمة</label>
                        <input type="text" placeholder="مثال: متابعة حمل">
                    </div>
                    <div class="form-group">
                        <label>الرمز/الأيقونة</label>
                        <input type="text" placeholder="fa-solid fa-baby">
                    </div>
                    <div class="form-group">
                        <label>الوصف المختصر</label>
                        <input type="text" placeholder="رعاية دورية دقيقة...">
                    </div>
                    <button class="remove-entry-btn" title="حذف"><i class="fa-solid fa-trash-can"></i></button>
                `;
                container.appendChild(entry);
                entry.querySelector('.remove-entry-btn').addEventListener('click', () => entry.remove());
            });
        }

        // Save draft
        const saveDraftBtn = document.getElementById('save-draft-btn');
        if (saveDraftBtn) {
            saveDraftBtn.addEventListener('click', savePatientPageDraft);
        }

        // Publish
        const publishBtn = document.getElementById('publish-patient-page-btn');
        if (publishBtn) {
            publishBtn.addEventListener('click', publishPatientPage);
        }

        function savePatientPageDraft() {
            const draftData = collectPatientPageData();
            draftData.lastUpdated = new Date().toISOString();
            draftData.isDraft = true;

            database.ref('clinic_page/draft').set(draftData).then(() => {
                alert('تم حفظ المسودة بنجاح');
            }).catch(err => {
                console.error('Error saving draft:', err);
                alert('حدث خطأ في حفظ المسودة');
            });
        }

        function publishPatientPage() {
            const draftData = collectPatientPageData();
            draftData.lastUpdated = new Date().toISOString();
            draftData.isDraft = false;
            draftData.publishedAt = new Date().toISOString();

            database.ref('clinic_page/published').set(draftData).then(() => {
                // Also update draft to reflect published state
                database.ref('clinic_page/draft').update({ isDraft: false, publishedAt: draftData.publishedAt });
                alert('تم نشر صفحة المريض بنجاح!');
                closeEditPatientModal();
            }).catch(err => {
                console.error('Error publishing:', err);
                alert('حدث خطأ في النشر');
            });
        }

        function collectPatientPageData() {
            const data = {
                doctor: {
                    name: document.getElementById('edit-doc-name').value,
                    title: document.getElementById('edit-doc-title').value,
                    credentials: document.getElementById('edit-doc-credentials').value.split('\n').filter(c => c.trim()),
                    image: document.getElementById('edit-doc-image').value || 'doctor.jpeg'
                },
                workingHours: [],
                addresses: [],
                services: [],
                footer: {
                    phone: document.getElementById('edit-footer-phone').value,
                    email: document.getElementById('edit-footer-email').value,
                    address: document.getElementById('edit-footer-address').value,
                    hours: document.getElementById('edit-footer-hours').value
                }
            };

            // Collect working hours
            document.querySelectorAll('#working-hours-container .working-hours-entry').forEach(entry => {
                const selects = entry.querySelectorAll('select');
                const inputs = entry.querySelectorAll('input[type="time"]');
                if (selects[0]?.value) {
                    data.workingHours.push({
                        day: selects[0].value,
                        from: inputs[0]?.value || '',
                        to: inputs[1]?.value || ''
                    });
                }
            });

            // Collect addresses
            document.querySelectorAll('#addresses-container .address-entry input').forEach(input => {
                if (input.value.trim()) {
                    data.addresses.push(input.value.trim());
                }
            });

            // Collect services
            document.querySelectorAll('#services-container .service-entry').forEach(entry => {
                const inputs = entry.querySelectorAll('input');
                if (inputs[0]?.value) {
                    data.services.push({
                        name: inputs[0].value,
                        icon: inputs[1]?.value || 'fa-solid fa-stethoscope',
                        description: inputs[2]?.value || ''
                    });
                }
            });

            return data;
        }

        function loadPatientPageDraft() {
            database.ref('clinic_page/draft').once('value', (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    populateEditForm(data);
                } else {
                    // Load from published if no draft
                    database.ref('clinic_page/published').once('value', (pubSnap) => {
                        const pubData = pubSnap.val();
                        if (pubData) populateEditForm(pubData);
                    });
                }
            });
        }

        function populateEditForm(data) {
            if (data.doctor) {
                document.getElementById('edit-doc-name').value = data.doctor.name || '';
                document.getElementById('edit-doc-title').value = data.doctor.title || '';
                document.getElementById('edit-doc-credentials').value = (data.doctor.credentials || []).join('\n');
                document.getElementById('edit-doc-image').value = data.doctor.image || 'doctor.jpeg';
            }

            if (data.workingHours?.length) {
                const container = document.getElementById('working-hours-container');
                container.innerHTML = '';
                data.workingHours.forEach(wh => {
                    const entry = document.createElement('div');
                    entry.className = 'working-hours-entry';
                    entry.innerHTML = `
                        <div class="form-group">
                            <label>اليوم</label>
                            <select>
                                <option value="السبت" ${wh.day === 'السبت' ? 'selected' : ''}>السبت</option>
                                <option value="الأحد" ${wh.day === 'الأحد' ? 'selected' : ''}>الأحد</option>
                                <option value="الإثنين" ${wh.day === 'الإثنين' ? 'selected' : ''}>الإثنين</option>
                                <option value="الثلاثاء" ${wh.day === 'الثلاثاء' ? 'selected' : ''}>الثلاثاء</option>
                                <option value="الأربعاء" ${wh.day === 'الأربعاء' ? 'selected' : ''}>الأربعاء</option>
                                <option value="الخميس" ${wh.day === 'الخميس' ? 'selected' : ''}>الخميس</option>
                                <option value="الجمعة" ${wh.day === 'الجمعة' ? 'selected' : ''}>الجمعة</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>من</label>
                            <input type="time" step="1800" value="${wh.from || ''}">
                        </div>
                        <div class="form-group">
                            <label>إلى</label>
                            <input type="time" step="1800" value="${wh.to || ''}">
                        </div>
                        <button class="remove-entry-btn" title="حذف"><i class="fa-solid fa-trash-can"></i></button>
                    `;
                    container.appendChild(entry);
                    entry.querySelector('.remove-entry-btn').addEventListener('click', () => entry.remove());
                });
            }

            if (data.addresses?.length) {
                const container = document.getElementById('addresses-container');
                container.innerHTML = '';
                data.addresses.forEach(addr => {
                    const entry = document.createElement('div');
                    entry.className = 'address-entry';
                    entry.innerHTML = `
                        <div class="form-group" style="grid-column: span 3;">
                            <label>العنوان</label>
                            <input type="text" value="${addr}">
                        </div>
                        <button class="remove-entry-btn" title="حذف"><i class="fa-solid fa-trash-can"></i></button>
                    `;
                    container.appendChild(entry);
                    entry.querySelector('.remove-entry-btn').addEventListener('click', () => entry.remove());
                });
            }

            if (data.services?.length) {
                const container = document.getElementById('services-container');
                container.innerHTML = '';
                data.services.forEach(svc => {
                    const entry = document.createElement('div');
                    entry.className = 'service-entry';
                    entry.innerHTML = `
                        <div class="form-group">
                            <label>اسم الخدمة</label>
                            <input type="text" value="${svc.name}">
                        </div>
                        <div class="form-group">
                            <label>الرمز/الأيقونة</label>
                            <input type="text" value="${svc.icon}">
                        </div>
                        <div class="form-group">
                            <label>الوصف المختصر</label>
                            <input type="text" value="${svc.description || ''}">
                        </div>
                        <button class="remove-entry-btn" title="حذف"><i class="fa-solid fa-trash-can"></i></button>
                    `;
                    container.appendChild(entry);
                    entry.querySelector('.remove-entry-btn').addEventListener('click', () => entry.remove());
                });
            }

            if (data.footer) {
                document.getElementById('edit-footer-phone').value = data.footer.phone || '';
                document.getElementById('edit-footer-email').value = data.footer.email || '';
                document.getElementById('edit-footer-address').value = data.footer.address || '';
                document.getElementById('edit-footer-hours').value = data.footer.hours || '';
            }
        }

        // Render preview
        const previewBtn = document.getElementById('preview-patient-page-btn');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                const draftData = collectPatientPageData();
                renderPatientPagePreview(draftData);
                // Switch to preview tab
                modal.querySelectorAll('.edit-tab-btn').forEach(b => b.classList.remove('active'));
                modal.querySelectorAll('.edit-tab-pane').forEach(p => p.classList.remove('active'));
                document.querySelector('.edit-tab-btn[data-tab="preview"]').classList.add('active');
                document.getElementById('preview-tab').classList.add('active');
            });
        }

        function renderPatientPagePreview(data) {
            const previewContainer = document.getElementById('patient-page-preview');
            if (!previewContainer) return;

            const doctor = data.doctor || {};
            const hours = data.workingHours || [];
            const addresses = data.addresses || [];
            const services = data.services || [];
            const footer = data.footer || {};

            let hoursHtml = '';
            hours.forEach(h => {
                hoursHtml += `<li><i class="fa-regular fa-clock"></i> ${h.day}: ${h.from} - ${h.to}</li>`;
            });

            let addressesHtml = '';
            addresses.forEach(a => {
                addressesHtml += `<li><i class="fa-solid fa-location-dot"></i> ${a}</li>`;
            });

            let servicesHtml = '';
            services.forEach(s => {
                servicesHtml += `
                    <div class="service-card-modern">
                        <div class="service-img-wrapper">
                            <div class="service-fallback-icon"><i class="${s.icon}"></i></div>
                        </div>
                        <div class="service-card-body">
                            <div class="service-header-icon"><i class="${s.icon}"></i></div>
                            <h3>${s.name}</h3>
                            <p>${s.description}</p>
                        </div>
                    </div>
                `;
            });

            previewContainer.innerHTML = `
                <section class="hero-section">
                    <div class="container hero-container">
                        <div class="hero-content">
                            <span class="badge"><i class="fa-solid fa-award"></i> رعاية طبية متكاملة بأحدث المعايير</span>
                            <h2>${doctor.name ? `نعتني بصحتك مع ${doctor.name}` : 'نعتني بصحتك وبداية حياة جديدة لمولودك بكل حب وأمان'}</h2>
                            <p>في كلينيك زون، نوفر لكِ بيئة طبية هادئة ومريحة مجهزة بأحدث أجهزة السونار والتقنيات الطبية المتقدمة تحت إشراف نخبة من الاستشاريين المتخصصين.</p>
                            <div class="hero-buttons">
                                <a href="#booking-section" class="btn btn-primary"><i class="fa-solid fa-calendar-check"></i> احجزي موعدك الآن</a>
                                <a href="#services-section" class="btn btn-outline"><i class="fa-solid fa-stethoscope"></i> خدماتنا الطبية</a>
                            </div>
                        </div>
                        <div class="doctor-profile-card">
                            <div class="doc-avatar">
                                <img src="${doctor.image || 'doctor.jpeg'}" alt="${doctor.name || 'الدكتور'}" onerror="handleDoctorImgFallback(this)">
                            </div>
                            <h3>${doctor.name || 'د. أحمد السيد'}</h3>
                            <p class="doc-title">${doctor.title || 'استشاري أمراض النساء والتوليد'}</p>
                            <ul class="doc-credentials">
                                ${(doctor.credentials || []).map(c => `<li><i class="fa-solid fa-circle-check"></i> ${c}</li>`).join('')}
                            </ul>
                            <div class="clinic-hours">
                                ${hoursHtml || '<i class="fa-regular fa-clock"></i> مواعيد العيادة: السبت - الخميس (٤ م - ١٠ م)'}
                            </div>
                        </div>
                    </div>
                </section>
                <section id="services-section" class="services-section container">
                    <div class="section-title">
                        <h2>خدماتنا الطبية المتميزة</h2>
                        <p>رعاية طبية تخصصية متكاملة لصحة المرأة في جميع مراحل حياتها</p>
                    </div>
                    <div class="services-grid services-5-grid">
                        ${servicesHtml || '<div style="text-align:center;color:var(--text-muted);padding:2rem;">لا توجد خدمات محددة بعد</div>'}
                    </div>
                </section>
                <section class="booking-section" style="padding: 60px 0;">
                    <div class="container">
                        <div class="section-title">
                            <h2>معلومات التواصل والعنوان</h2>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:30px;">
                            <div>
                                <h3 style="color:var(--primary);margin-bottom:15px;"><i class="fa-solid fa-location-dot"></i> العناوين</h3>
                                <ul style="list-style:none;padding:0;">${addressesHtml || '<li><i class="fa-solid fa-location-dot"></i> شارع الجمهورية - برج الأطباء التخصصي - الدور الثالث</li>'}</ul>
                            </div>
                            <div>
                                <h3 style="color:var(--primary);margin-bottom:15px;"><i class="fa-regular fa-clock"></i> مواعيد العمل</h3>
                                <ul style="list-style:none;padding:0;">${hoursHtml || '<li><i class="fa-regular fa-clock"></i> السبت - الخميس: 4:00 م - 10:00 م</li><li><i class="fa-solid fa-calendar-xmark"></i> الجمعة: إجازة</li>'}</ul>
                            </div>
                        </div>
                    </div>
                </section>
            `;
        }
    }

    // ==========================================
    // MANAGE DASHBOARD MODAL
    // ==========================================
    function initManageDashboardModal() {
        const modal = document.getElementById('manage-dashboard-modal');
        const manageMenuItem = document.getElementById('drawer-manage-dashboard');
        if (manageMenuItem) {
            manageMenuItem.addEventListener('click', (e) => {
                e.preventDefault();
                openManageDashboardModal();
            });
        }

        function openManageDashboardModal() {
            if (modal) {
                modal.classList.remove('hidden');
                loadDashboardTheme();
                renderBookingsManagement();
                initCalendarView();
            }
        }

        window.closeManageDashboardModal = function() {
            if (modal) modal.classList.add('hidden');
        };

        // Tab switching
        modal?.querySelectorAll('.manage-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.manage-tab-btn').forEach(b => b.classList.remove('active'));
                modal.querySelectorAll('.manage-tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab + '-tab').classList.add('active');

                // Initialize calendar when tab is shown
                if (btn.dataset.tab === 'calendar') {
                    initCalendarView();
                }
            });
        });

        // Bookings Management - Search and Filter
        const mgmtSearch = document.getElementById('mgmt-search');
        const mgmtFilterStatus = document.getElementById('mgmt-filter-status');
        const mgmtFilterDate = document.getElementById('mgmt-filter-date');

        [mgmtSearch, mgmtFilterStatus, mgmtFilterDate].forEach(el => {
            if (el) el.addEventListener('input', renderBookingsManagement);
        });

        function renderBookingsManagement() {
            const tbody = document.getElementById('mgmt-bookings-table-body');
            if (!tbody) return;

            const bookings = window.allBookings || [];
            const searchTerm = mgmtSearch?.value.toLowerCase() || '';
            const statusFilter = mgmtFilterStatus?.value || '';
            const dateFilter = mgmtFilterDate?.value || '';

            let filtered = bookings.filter(b => {
                const matchesSearch = !searchTerm ||
                    b.name.toLowerCase().includes(searchTerm) ||
                    b.phone.includes(searchTerm);
                const matchesStatus = !statusFilter || b.status === statusFilter;
                const matchesDate = !dateFilter || b.date === dateFilter;
                return matchesSearch && matchesStatus && matchesDate;
            });

            // Sort by date desc, then time desc
            filtered.sort((a, b) => {
                if (a.date !== b.date) return new Date(b.date) - new Date(a.date);
                return b.time.localeCompare(a.time);
            });

            tbody.innerHTML = '';
            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">لا توجد حجوزات مطابقة</td></tr>';
                return;
            }

            filtered.forEach(b => {
                const statusClass = b.status === 'مؤكد' ? 'status-confirmed' :
                                    (b.status === 'ملغي' ? 'status-cancelled' : 'status-pending');
                const dateParts = b.date.split('-');
                const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                let displayPhone = b.phone;
                if (displayPhone.startsWith('01')) displayPhone = '20' + displayPhone.slice(2);

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${b.name}</strong></td>
                    <td>${formattedDate}<br><small>${b.time}</small></td>
                    <td><span style="color:var(--primary-dark);font-weight:700;">${b.visitType}</span></td>
                    <td><a href="#" onclick="openWhatsApp('${b.phone}', 'مرحباً ${b.name}'); return false;">${displayPhone}</a></td>
                    <td><span class="status-badge ${statusClass}">${b.status}</span></td>
                    <td>${b.notes || '-'}</td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn btn-confirm" onclick="updateBookingStatus('${b.id}', 'مؤكد')" title="تأكيد"><i class="fa-solid fa-check"></i></button>
                            <button class="action-btn btn-cancel" onclick="updateBookingStatus('${b.id}', 'ملغي')" title="إلغاء"><i class="fa-solid fa-xmark"></i></button>
                            <button class="action-btn btn-whatsapp" onclick="openWhatsApp('${b.phone}', 'مرحباً ${b.name}')"><i class="fa-brands fa-whatsapp"></i></button>
                            <button class="action-btn btn-danger" onclick="deleteBooking('${b.id}')" title="حذف" style="background:var(--danger);border-color:var(--danger);width:auto;padding:0 10px;"> حذف </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Calendar View
        let currentCalDate = new Date();

        function initCalendarView() {
            renderCalendar(currentCalDate);
            setupCalendarNavigation();
        }

        function setupCalendarNavigation() {
            const prevBtn = document.getElementById('cal-prev-month');
            const nextBtn = document.getElementById('cal-next-month');
            const todayBtn = document.getElementById('cal-today');

            if (prevBtn) prevBtn.onclick = () => navigateCalendar(-1);
            if (nextBtn) nextBtn.onclick = () => navigateCalendar(1);
            if (todayBtn) todayBtn.onclick = () => { currentCalDate = new Date(); renderCalendar(currentCalDate); };
        }

        function navigateCalendar(delta) {
            currentCalDate.setMonth(currentCalDate.getMonth() + delta);
            renderCalendar(currentCalDate);
        }

        function renderCalendar(date) {
            const grid = document.getElementById('calendar-grid');
            const title = document.getElementById('cal-title');
            if (!grid || !title) return;

            const year = date.getFullYear();
            const month = date.getMonth();

            const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
            title.textContent = `${monthNames[month]} ${year}`;

            // Get first day of month and number of days
            const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const prevMonthDays = new Date(year, month, 0).getDate();

            // Adjust for RTL (Saturday = 0 in Arabic locale, but JS uses Sunday = 0)
            // In Arabic calendar, week starts Saturday
            const dayNames = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

            // Clear grid except headers
            grid.innerHTML = '';
            dayNames.forEach(d => {
                const header = document.createElement('div');
                header.className = 'calendar-day-header';
                header.textContent = d;
                grid.appendChild(header);
            });

            // Get bookings for this month
            const bookings = window.allBookings || [];
            const monthBookings = bookings.filter(b => {
                const bDate = new Date(b.date);
                return bDate.getFullYear() === year && bDate.getMonth() === month && b.status !== 'ملغي';
            });

            // Group bookings by day
            const bookingsByDay = {};
            monthBookings.forEach(b => {
                const day = new Date(b.date).getDate();
                if (!bookingsByDay[day]) bookingsByDay[day] = [];
                bookingsByDay[day].push(b);
            });

            // Calculate starting offset (convert JS Sunday=0 to Saturday=0)
            const startOffset = (firstDay + 6) % 7; // Saturday = 0

            // Previous month days
            for (let i = startOffset - 1; i >= 0; i--) {
                const dayNum = prevMonthDays - i;
                const dayEl = createCalendarDay(dayNum, true, []);
                grid.appendChild(dayEl);
            }

            // Current month days
            const today = new Date();
            const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

            for (let day = 1; day <= daysInMonth; day++) {
                const dayBookings = bookingsByDay[day] || [];
                const isToday = isCurrentMonth && today.getDate() === day;
                const dayEl = createCalendarDay(day, false, dayBookings, isToday);
                grid.appendChild(dayEl);
            }

            // Next month days to fill grid
            const totalCells = startOffset + daysInMonth;
            const nextMonthDaysNeeded = Math.ceil(totalCells / 7) * 7 - totalCells;
            for (let day = 1; day <= nextMonthDaysNeeded; day++) {
                const dayEl = createCalendarDay(day, true, []);
                grid.appendChild(dayEl);
            }
        }

        function createCalendarDay(dayNum, isOtherMonth, bookings, isToday = false) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day' + (isOtherMonth ? ' other-month' : '');

            // Check for conflicts and density
            const activeBookings = bookings.filter(b => b.status !== 'ملغي');
            const hasConflict = activeBookings.length > 1 && activeBookings.some((b, i) =>
                activeBookings.some((b2, j) => i !== j && b.time === b2.time)
            );
            const isHighDensity = activeBookings.length >= 4;

            if (hasConflict) dayEl.classList.add('conflict');
            else if (isHighDensity) dayEl.classList.add('high-density');

            let html = `<div class="calendar-day-number">${dayNum}</div>`;
            if (isToday) html += `<span class="density-warning" style="background:var(--primary);color:white;">اليوم</span>`;
            else if (hasConflict) html += `<span class="density-warning">تعارض</span>`;
            else if (isHighDensity) html += `<span class="density-warning">كثافة</span>`;

            activeBookings.forEach(b => {
                const statusClass = b.status === 'مؤكد' ? 'confirmed' : 'pending';
                html += `<div class="calendar-booking ${statusClass}" title="${b.name} - ${b.time}">${b.time} ${b.name.substring(0,8)}</div>`;
            });

            dayEl.innerHTML = html;
            return dayEl;
        }

        // Theme Colors
        const themeOptions = document.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            option.addEventListener('click', () => {
                const theme = option.dataset.theme;
                applyDashboardTheme(theme);
                themeOptions.forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                saveDashboardTheme(theme);
            });
        });

        function applyDashboardTheme(theme) {
            const root = document.documentElement;
            const themes = {
                default: { primary: '#0d9488', 'primary-light': '#ccfbf1', 'primary-dark': '#0f766e' },
                blue: { primary: '#3b82f6', 'primary-light': '#dbeafe', 'primary-dark': '#2563eb' },
                green: { primary: '#10b981', 'primary-light': '#d1fae5', 'primary-dark': '#059669' },
                purple: { primary: '#8b5cf6', 'primary-light': '#ede9fe', 'primary-dark': '#7c3aed' },
                orange: { primary: '#f97316', 'primary-light': '#ffedd5', 'primary-dark': '#ea580c' },
                red: { primary: '#ef4444', 'primary-light': '#fee2e2', 'primary-dark': '#dc2626' }
            };

            const colors = themes[theme] || themes.default;
            Object.entries(colors).forEach(([key, value]) => {
                root.style.setProperty(`--${key}`, value);
            });
        }

        function saveDashboardTheme(theme) {
            localStorage.setItem('dashboard_theme', theme);
            // Also save to Firebase for cross-device sync
            database.ref('clinic_settings/theme').set(theme).catch(console.error);
        }

        function loadDashboardTheme() {
            const saved = localStorage.getItem('dashboard_theme') || 'default';
            applyDashboardTheme(saved);
            themeOptions.forEach(o => o.classList.toggle('active', o.dataset.theme === saved));
        }
    }

    // ==========================================
    // ACCOUNT SETTINGS MODAL
    // ==========================================
    function initAccountSettingsModal() {
        const modal = document.getElementById('account-settings-modal');
        const accountMenuItem = document.getElementById('drawer-account-settings');
        if (accountMenuItem) {
            accountMenuItem.addEventListener('click', (e) => {
                e.preventDefault();
                openAccountSettingsModal();
            });
        }

        function openAccountSettingsModal() {
            if (modal) {
                modal.classList.remove('hidden');
                loadAccountSettings();
            }
        }

        window.closeAccountSettingsModal = function() {
            if (modal) modal.classList.add('hidden');
        };

        // Tab switching
        modal?.querySelectorAll('.settings-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
                modal.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
            });
        });

        // Password change form
        const changePwdForm = document.getElementById('change-password-form');
        if (changePwdForm) {
            changePwdForm.addEventListener('submit', (e) => {
                e.preventDefault();
                changePassword();
            });
        }

        // Password strength meter
        const newPwdInput = document.getElementById('new-password');
        if (newPwdInput) {
            newPwdInput.addEventListener('input', checkPasswordStrength);
        }

        // Password match check
        const confirmPwdInput = document.getElementById('confirm-password');
        if (confirmPwdInput) {
            confirmPwdInput.addEventListener('input', checkPasswordMatch);
        }

        // Forgot password form
        const forgotPwdForm = document.getElementById('forgot-password-form');
        if (forgotPwdForm) {
            forgotPwdForm.addEventListener('submit', (e) => {
                e.preventDefault();
                sendForgotPasswordOTP();
            });
        }

        // OTP verification form
        const otpForm = document.getElementById('otp-verification-form');
        if (otpForm) {
            otpForm.addEventListener('submit', (e) => {
                e.preventDefault();
                verifyOTP();
            });
        }

        // Resend OTP
        const resendOtpBtn = document.getElementById('resend-otp-btn');
        if (resendOtpBtn) {
            resendOtpBtn.addEventListener('click', resendOTP);
        }

        // Email settings form
        const emailForm = document.getElementById('email-settings-form');
        if (emailForm) {
            emailForm.addEventListener('submit', (e) => {
                e.preventDefault();
                saveEmailSettings();
            });
        }

        function loadAccountSettings() {
            // Load from localStorage
            const loginEmail = localStorage.getItem('doctor_login_email');
            const notifyEmail = localStorage.getItem('doctor_notify_email');

            if (loginEmail) document.getElementById('login-email').value = loginEmail;
            if (notifyEmail) document.getElementById('notify-email').value = notifyEmail;
        }

        function checkPasswordStrength() {
            const pwd = newPwdInput.value;
            const strengthEl = document.getElementById('password-strength');
            if (!strengthEl) return;

            let strength = 0;
            if (pwd.length >= 8) strength++;
            if (/[A-Z]/.test(pwd)) strength++;
            if (/[a-z]/.test(pwd)) strength++;
            if (/[0-9]/.test(pwd)) strength++;
            if (/[^A-Za-z0-9]/.test(pwd)) strength++;

            strengthEl.className = 'password-strength';
            if (strength <= 2) {
                strengthEl.textContent = 'ضعيفة - أضف أحرف كبيرة وصغيرة وأرقام ورموز';
                strengthEl.classList.add('weak');
            } else if (strength <= 3) {
                strengthEl.textContent = 'متوسطة - جيدة ولكن يمكن تحسينها';
                strengthEl.classList.add('medium');
            } else {
                strengthEl.textContent = 'قوية - كلمة مرور ممتازة';
                strengthEl.classList.add('strong');
            }
        }

        function checkPasswordMatch() {
            const pwd = newPwdInput?.value;
            const confirm = confirmPwdInput?.value;
            const matchEl = document.getElementById('password-match');
            if (!matchEl) return;

            if (!confirm) {
                matchEl.textContent = '';
                matchEl.className = 'password-match';
            } else if (pwd === confirm) {
                matchEl.textContent = 'كلمات المرور متطابقة ✓';
                matchEl.className = 'password-match match';
            } else {
                matchEl.textContent = 'كلمات المرور غير متطابقة ✗';
                matchEl.className = 'password-match no-match';
            }
        }

        function changePassword() {
            const current = document.getElementById('current-password').value;
            const newPwd = newPwdInput.value;
            const confirm = confirmPwdInput.value;

            if (current !== '1234') {
                alert('كلمة المرور الحالية غير صحيحة');
                return;
            }

            if (newPwd !== confirm) {
                alert('كلمات المرور الجديدة غير متطابقة');
                return;
            }

            if (newPwd.length < 8) {
                alert('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
                return;
            }

            // In a real app, this would update Firebase Auth
            // For now, we'll store in localStorage as a demo
            localStorage.setItem('doctor_password', newPwd);
            alert('تم تغيير كلمة المرور بنجاح');
            changePwdForm.reset();
            document.getElementById('password-strength').textContent = '';
            document.getElementById('password-match').textContent = '';
        }

        // SMS OTP rate limiting
        let otpAttempts = 0;
        let lastOtpTime = 0;
        const MAX_OTP_ATTEMPTS = 3;
        const OTP_COOLDOWN_MS = 60000; // 1 minute

        function sendForgotPasswordOTP() {
            const phone = document.getElementById('forgot-phone').value;
            if (!phone) {
                alert('يرجى إدخال رقم الهاتف');
                return;
            }

            const now = Date.now();
            if (otpAttempts >= MAX_OTP_ATTEMPTS && now - lastOtpTime < OTP_COOLDOWN_MS) {
                const waitTime = Math.ceil((OTP_COOLDOWN_MS - (now - lastOtpTime)) / 1000);
                showOTPStatus(`يرجى الانتظار ${waitTime} ثانية قبل طلب رمز جديد`, 'error');
                return;
            }

            // Simulate sending OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            localStorage.setItem('doctor_reset_otp', otp);
            localStorage.setItem('doctor_reset_phone', phone);
            lastOtpTime = now;
            otpAttempts++;

            // Show OTP verification form
            document.getElementById('forgot-password-form').classList.add('hidden');
            document.getElementById('otp-verification-form').classList.remove('hidden');
            document.getElementById('otp-phone-display').textContent = phone;

            showOTPStatus('تم إرسال رمز التحقق إلى واتساب (محاكاة)', 'sent');

            // For demo, also log to console
            console.log('OTP for password reset:', otp);
        }

        function verifyOTP() {
            const enteredOtp = document.getElementById('otp-code').value;
            const storedOtp = localStorage.getItem('doctor_reset_otp');
            const phone = localStorage.getItem('doctor_reset_phone');

            if (enteredOtp === storedOtp) {
                showOTPStatus('تم التحقق بنجاح! يمكنك الآن تعيين كلمة مرور جديدة', 'success');
                setTimeout(() => {
                    document.getElementById('otp-verification-form').classList.add('hidden');
                    document.getElementById('set-new-password-form').classList.remove('hidden');
                }, 1500);
            } else {
                showOTPStatus('رمز التحقق غير صحيح', 'error');
            }
        }

        function resendOTP() {
            const phone = document.getElementById('otp-phone-display').textContent;
            document.getElementById('forgot-phone').value = phone;
            sendForgotPasswordOTP();
        }

        function showOTPStatus(message, type) {
            const statusEl = document.getElementById('otp-status');
            if (!statusEl) return;
            statusEl.textContent = message;
            statusEl.className = 'otp-status ' + type;
        }

        // Set new password after OTP verification
        const setNewPwdForm = document.getElementById('set-new-password-form');
        if (setNewPwdForm) {
            setNewPwdForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const newPwd = document.getElementById('new-password-after-otp').value;
                const confirm = document.getElementById('confirm-password-after-otp').value;

                if (newPwd !== confirm) {
                    alert('كلمات المرور غير متطابقة');
                    return;
                }
                if (newPwd.length < 8) {
                    alert('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
                    return;
                }

                localStorage.setItem('doctor_password', newPwd);
                localStorage.removeItem('doctor_reset_otp');
                localStorage.removeItem('doctor_reset_phone');
                otpAttempts = 0;

                alert('تم تعيين كلمة المرور الجديدة بنجاح');
                setNewPwdForm.reset();
                document.getElementById('set-new-password-form').classList.add('hidden');
                document.getElementById('forgot-password-form').classList.remove('hidden');
            });
        }

        function saveEmailSettings() {
            const loginEmail = document.getElementById('login-email').value;
            const notifyEmail = document.getElementById('notify-email').value;

            if (loginEmail && !loginEmail.includes('@')) {
                alert('بريد الدخول الإلكتروني غير صحيح');
                return;
            }
            if (notifyEmail && !notifyEmail.includes('@')) {
                alert('بريد الإشعارات غير صحيح');
                return;
            }

            localStorage.setItem('doctor_login_email', loginEmail);
            localStorage.setItem('doctor_notify_email', notifyEmail);

            // Also save to Firebase
            database.ref('clinic_settings/emails').set({
                login: loginEmail,
                notifications: notifyEmail
            }).catch(console.error);

            alert('تم حفظ إعدادات البريد الإلكتروني بنجاح');
        }
    }

    // ==========================================
    // CONTACT CLINIC ZONE MODAL
    // ==========================================
    function initContactClinicZoneModal() {
        const modal = document.getElementById('contact-clinic-zone-modal');
        const contactMenuItem = document.getElementById('drawer-contact-clinic-zone');
        if (contactMenuItem) {
            contactMenuItem.addEventListener('click', (e) => {
                e.preventDefault();
                openContactModal();
            });
        }

        function openContactModal() {
            if (modal) {
                modal.classList.remove('hidden');
                // Auto-attach clinic name and code
                attachClinicInfoToChat();
            }
        }

        window.closeContactModal = function() {
            if (modal) modal.classList.add('hidden');
        };

        // Send message
        const sendBtn = document.getElementById('chat-send-btn');
        const chatInput = document.getElementById('chat-input');

        if (sendBtn) {
            sendBtn.addEventListener('click', sendChatMessage);
        }

        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                }
            });
        }

        function attachClinicInfoToChat() {
            const clinicName = 'كلينيك زون - د. أحمد السيد';
            const clinicCode = localStorage.getItem('clinic_code') || generateClinicCode();

            // Pre-fill or show as first message
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer && messagesContainer.children.length <= 1) {
                // Add system message with clinic info
                const sysMsg = document.createElement('div');
                sysMsg.className = 'chat-message bot';
                sysMsg.innerHTML = `
                    <div class="message-bubble">
                        <strong>معلومات العيادة المرفقة تلقائياً:</strong><br>
                        الاسم: ${clinicName}<br>
                        الكود: ${clinicCode}
                        <small>سيتم إرفاق هذه المعلومات مع كل رسالة</small>
                    </div>
                `;
                messagesContainer.appendChild(sysMsg);
            }
        }

        function sendChatMessage() {
            const input = document.getElementById('chat-input');
            const messagesContainer = document.getElementById('chat-messages');
            if (!input || !messagesContainer || !input.value.trim()) return;

            const message = input.value.trim();
            input.value = '';

            // Add user message
            addChatMessage(message, 'user');

            // Simulate Clinic Zone reply (in real app, this would go to support system)
            setTimeout(() => {
                addAutoReply(message);
            }, 1500);
        }

        function addChatMessage(text, sender) {
            const messagesContainer = document.getElementById('chat-messages');
            const msgDiv = document.createElement('div');
            msgDiv.className = `chat-message ${sender === 'user' ? 'user' : 'bot'}`;
            const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            msgDiv.innerHTML = `<div class="message-bubble">${text}<small>${time}</small></div>`;
            messagesContainer.appendChild(msgDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        function addAutoReply(userMessage) {
            // Simulated auto-reply based on keywords
            let reply = 'شكراً لتواصلكم مع دعم كلينيك زون. فريقنا سيرد عليكم خلال 10 دقائق.';

            if (userMessage.includes('كود') || userMessage.includes('code')) {
                const code = localStorage.getItem('clinic_code') || 'غير محدد';
                reply = `كود العيادة الخاص بكم هو: ${code}`;
            } else if (userMessage.includes('حجز') || userMessage.includes('booking')) {
                reply = 'لإدارة الحجوزات، يرجى استخدام لوحة الطبيب. هل تحتاج مساعدة محددة؟';
            } else if (userMessage.includes('فاتورة') || userMessage.includes('دفع') || userMessage.includes('اشتراك')) {
                reply = 'للاستفسارات المالية والاشتراكات، سيتواصل معكم فريق المحاسبة خلال 15 دقيقة.';
            }

            addChatMessage(reply, 'bot');
        }

        function generateClinicCode() {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            localStorage.setItem('clinic_code', code);
            database.ref('clinic_settings/clinic_code').set(code).catch(console.error);
            return code;
        }
    }

    // ==========================================
    // CLINIC CODE MODAL
    // ==========================================
    function initClinicCodeModal() {
        const modal = document.getElementById('clinic-code-modal');
        const codeMenuItem = document.getElementById('drawer-clinic-code');
        if (codeMenuItem) {
            codeMenuItem.addEventListener('click', (e) => {
                e.preventDefault();
                openClinicCodeModal();
            });
        }

        function openClinicCodeModal() {
            if (modal) {
                modal.classList.remove('hidden');
                loadClinicCode();
            }
        }

        window.closeClinicCodeModal = function() {
            if (modal) modal.classList.add('hidden');
        };

        // Copy code
        const copyBtn = document.getElementById('copy-clinic-code-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', copyClinicCode);
        }

        // Regenerate code
        const regenerateBtn = document.getElementById('regenerate-clinic-code-btn');
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', regenerateClinicCode);
        }

        function loadClinicCode() {
            // Try localStorage first
            let code = localStorage.getItem('clinic_code');

            if (!code) {
                // Try Firebase
                database.ref('clinic_settings/clinic_code').once('value', (snapshot) => {
                    const fbCode = snapshot.val();
                    if (fbCode) {
                        code = fbCode;
                        localStorage.setItem('clinic_code', code);
                        displayClinicCode(code);
                    } else {
                        // Generate new
                        code = generateClinicCode();
                        displayClinicCode(code);
                    }
                });
            } else {
                displayClinicCode(code);
            }
        }

        function displayClinicCode(code) {
            const codeEl = document.getElementById('clinic-code-value');
            if (codeEl) codeEl.textContent = code;
        }

        function generateClinicCode() {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            localStorage.setItem('clinic_code', code);
            database.ref('clinic_settings/clinic_code').set(code).catch(console.error);
            return code;
        }

        function regenerateClinicCode() {
            if (!confirm('سيتم إنشاء كود جديد وسيبطل الكود الحالي. هل تريد المتابعة؟')) return;

            const code = generateClinicCode();
            displayClinicCode(code);
            alert('تم إنشاء كود عيادة جديد: ' + code);
        }

        function copyClinicCode() {
            const codeEl = document.getElementById('clinic-code-value');
            if (!codeEl) return;

            const code = codeEl.textContent;
            navigator.clipboard.writeText(code).then(() => {
                const copyBtn = document.getElementById('copy-clinic-code-btn');
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ!';
                copyBtn.style.background = 'var(--success)';
                copyBtn.style.borderColor = 'var(--success)';

                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.background = '';
                    copyBtn.style.borderColor = '';
                }, 2000);
            }).catch(() => {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = code;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                alert('تم نسخ الكود: ' + code);
            });
        }
    }
});