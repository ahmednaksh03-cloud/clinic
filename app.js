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

                // Format phone with WhatsApp prefix
                let displayPhone = b.phone;
                if (displayPhone.startsWith('01')) displayPhone = '20' + displayPhone.slice(2);

                // Format date display
                const dateParts = b.date.split('-');
                const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

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
});