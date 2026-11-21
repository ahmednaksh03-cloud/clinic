/* ==========================================
   APP.JS - CLINIC ZONE (Pure Local Real-Time Sync)
   Uses localStorage only - no servers, no localhost calls
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // CONFIGURATION
    // ==========================================
    const STORAGE_KEY = 'clinic_zone_bookings';
    const PASSWORD = '1234';
    const EMAILJS_SERVICE_ID = 'service_ghdqi7p';
    const EMAILJS_TEMPLATE_ID = 'template_m1g99vm';
    const EMAILJS_PUBLIC_KEY = 'x-Mr2JNw2KIkUIduW';

    // Web Audio API notification chime
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioContext = null;

    function playNotificationChime() {
        if (audioContext === null) {
            try {
                audioContext = new AudioContext();
            } catch (e) {
                return; // No audio support
            }
        }

        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = 440;
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        gainNode.gain.value = 0.1;

        oscillator.start();
        setTimeout(() => oscillator.stop(), 500);
    }

    // ==========================================
    // LOCALSTORAGE HELPERS
    // ==========================================
    function getBookings() {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        try {
            const parsed = JSON.parse(data);
            // Support both array of bookings and single booking object (legacy)
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
            console.error('Failed to parse bookings:', e);
            return [];
        }
    }

    function saveBookings(bookings) {
        // Ensure we always save as array
        const bookingsArray = Array.isArray(bookings) ? bookings : [bookings];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bookingsArray));
    }

    function addBooking(booking) {
        const bookings = getBookings();
        // Avoid duplicates by ID
        if (!bookings.some(b => b.id === booking.id)) {
            bookings.push(booking);
            saveBookings(bookings);
        }
    }

    function removeBooking(id) {
        const bookings = getBookings().filter(b => b.id !== id);
        saveBookings(bookings);
    }

    function updateBooking(id, updates) {
        const bookings = getBookings().map(b => {
            if (b.id === id) return { ...b, ...updates };
            return b;
        });
        saveBookings(bookings);
    }

    // ==========================================
    // TAB SYNC: storage event + 1-second interval + BroadcastChannel
    // ==========================================
    const SYNC_CHANNEL = 'clinic_zone_sync';
    const bc = new BroadcastChannel(SYNC_CHANNEL);

    // BroadcastChannel message handler for real-time sync
    bc.onmessage = (event) => {
        if (event.data === 'new-booking' || event.data === 'refresh') {
            if (document.body.classList.contains('doctor-page') && window.renderDashboard) {
                window.renderDashboard();
            }
            if (document.body.classList.contains('patient-page')) {
                checkExistingBooking();
            }
        }
    };

    // storage event listener for cross-tab sync
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
            // Re-render the UI for the current page
            if (document.body.classList.contains('doctor-page') && window.renderDashboard) {
                window.renderDashboard();
            }
            if (document.body.classList.contains('patient-page')) {
                checkExistingBooking();
            }
        }
    });

    // 1-second interval fallback for robustness (triggers re-render on doctor page)
    let syncInterval = setInterval(() => {
        if (document.body.classList.contains('doctor-page') && window.renderDashboard) {
            window.renderDashboard();
        }
        if (document.body.classList.contains('patient-page')) {
            checkExistingBooking();
        }
    }, 1000);

    // Helper for checking if set has all elements
    Set.prototype.hasAll = function(other) {
        for (let item of other) {
            if (!this.has(item)) return false;
        }
        return true;
    };

    // ==========================================
    // EMAILJS NOTIFICATION HELPER
    // ==========================================
    // Initialize EmailJS
    if (typeof emailjs !== 'undefined') {
        emailjs.init({ publicKey: "x-Mr2JNw2KIkUIduW" });
    }

    function sendEmailNotification(booking) {
        if (typeof emailjs === 'undefined') return;
        emailjs.send("service_ghdqi7p", "template_m1g99vm", {
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
    // WHATSAPP HELPER
    // ==========================================
    function openWhatsApp(phone, msg) {
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;
        else if (!cleanPhone.startsWith('20') && cleanPhone.length === 10) cleanPhone = '20' + cleanPhone;
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
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
        const patientBookingForm = document.getElementById('patient-booking-form');

        // Set min date to today
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.min = today;
            dateInput.value = today;
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

                // Save to localStorage
                addBooking(bookingData);

                // Save current booking reference for "View Booking" feature
                localStorage.setItem('my_current_booking', JSON.stringify({
                    id: bookingData.id,
                    name: bookingData.name,
                    phone: bookingData.phone
                }));

                // Play notification chime in doctor tabs
                playNotificationChime();

                // Send email notification (will silently skip if EmailJS empty)
                sendEmailNotification(bookingData);

                // Broadcast to other tabs via BroadcastChannel
                bc.postMessage('new-booking');

                // Show Success
                bookingForm.classList.add('hidden');
                successBox.classList.remove('hidden');
                navViewBtn.classList.remove('hidden');
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
                    removeBooking(id);
                    localStorage.removeItem('my_current_booking');
                }
                showForm();
            });
        }

        // Back to form
        if (backBtn) {
            backBtn.addEventListener('click', showForm);
        }

        function showForm() {
            patientBookingForm.reset();
            successBox.classList.add('hidden');
            detailsCard.classList.add('hidden');
            bookingForm.classList.remove('hidden');
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

            const bookings = getBookings();
            const booking = bookings.find(b => b.id === id);

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

                successBox.classList.add('hidden');
                detailsCard.classList.remove('hidden');
            } else {
                alert('تعذر تحميل تفاصيل الحجز.');
            }
        }

        function checkExistingBooking() {
            const stored = localStorage.getItem('my_current_booking');
            if (!stored) return;

            const { id, name, phone } = JSON.parse(stored);
            const bookings = getBookings();
            const booking = bookings.find(b => b.id === id && b.name === name && b.phone === phone);

            if (booking) {
                navViewBtn.classList.remove('hidden');
            } else {
                localStorage.removeItem('my_current_booking');
            }
        }
    }

    // ==========================================
    // DASHBOARD RENDERING (localStorage-based) - defined in shared scope for hoisting
    // ==========================================
    function renderDashboard() {
        if (!document.body.classList.contains('doctor-page')) return;

        const bookings = getBookings();
        const tbody = document.getElementById('bookings-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        // Update Stats
        document.getElementById('stat-total').innerText = bookings.length;
        document.getElementById('stat-pending').innerText = bookings.filter(b => b.status === 'قيد الانتظار').length;
        document.getElementById('stat-confirmed').innerText = bookings.filter(b => b.status === 'مؤكد').length;
        document.getElementById('stat-followup').innerText = bookings.filter(b => b.visitType && b.visitType.includes('متابعة')).length;

        if (bookings.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="6" style="text-align: center; padding: 2rem; color: var(--muted);">لا توجد حجوزات حالياً</td>`;
            tbody.appendChild(tr);
            return;
        }

        bookings.forEach(b => {
            const tr = document.createElement('tr');

            const statusClass = b.status === 'مؤكد' ? 'status-confirmed' :
                                (b.status === 'ملغي' ? 'status-cancelled' : 'status-pending');

            // Format phone with WhatsApp prefix
            let displayPhone = b.phone;
            if (displayPhone.startsWith('01')) displayPhone = '20' + displayPhone.slice(2);

            tr.innerHTML = `
                <td><strong>${b.name}</strong></td>
                <td>${b.date}<br><small>${b.time}</small></td>
                <td><span style="color:var(--primary-dark); font-weight:700;">${b.visitType}</span></td>
                <td><a href="#" onclick="openWhatsApp('${b.phone}', 'مرحباً ${b.name}، نود تأكيد حجزك في كلينيك زون'); return false;">${displayPhone}</a></td>
                <td><span class="status-badge ${statusClass}">${b.status}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn btn-confirm" onclick="updateBookingStatus('${b.id}', 'مؤكد')" title="تأكيد"><i class="fa-solid fa-check"></i></button>
                        <button class="action-btn btn-cancel" onclick="updateBookingStatus('${b.id}', 'ملغي')" title="إلغاء"><i class="fa-solid fa-xmark"></i></button>
                        <button class="action-btn btn-whatsapp" onclick="openWhatsApp('${b.phone}', 'مرحباً ${b.name}')"><i class="fa-brands fa-whatsapp"></i></button>
                        <button class="action-btn btn-primary" onclick="selectForRx('${b.id}')" style="width:auto; padding:0 10px;" title="روشتة">روشتة</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
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

        // Check Login State
        if (sessionStorage.getItem('doctor_logged_in') === 'true') {
            loginOverlay.classList.add('hidden');
            renderDashboard();
            startPolling();
        }

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const pwd = document.getElementById('login-password').value;
                if (pwd === PASSWORD) {
                    sessionStorage.setItem('doctor_logged_in', 'true');
                    loginOverlay.classList.add('hidden');
                    renderDashboard();
                    startPolling();
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

        if (refreshBtn) {
            refreshBtn.addEventListener('click', renderDashboard);
        }

        // Prescription logic
        const prescForm = document.getElementById('prescription-form');
        const medChips = document.querySelectorAll('.med-chip');
        const prescMedsArea = document.getElementById('presc-meds');

        medChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const med = chip.getAttribute('data-med');
                const currentVal = prescMedsArea.value;
                prescMedsArea.value = currentVal + (currentVal ? '\n' : '') + med + ': ';
                prescMedsArea.focus();
            });
        });

        document.getElementById('print-presc-btn').addEventListener('click', () => {
            const name = document.getElementById('presc-name').value;
            const meds = document.getElementById('presc-meds').value;
            const diagnosis = document.getElementById('presc-diagnosis').value;

            if (!name || !meds) return alert('يرجى إدخال اسم المريضة والأدوية firstly');

            document.getElementById('p-print-name').innerText = name;
            document.getElementById('p-print-date').innerText = new Date().toLocaleDateString('ar-EG');
            document.getElementById('p-print-diagnosis').innerText = diagnosis || 'حالة طبية عامة';
            document.getElementById('p-print-meds').innerText = meds;

            window.print();
        });

        document.getElementById('whatsapp-presc-btn').addEventListener('click', () => {
            const name = document.getElementById('presc-name').value;
            const phone = document.getElementById('presc-phone').value;
            const meds = document.getElementById('presc-meds').value;

            if (!name || !phone || !meds) return alert('البيانات غير مكتملة للإرسال');

            const msg = `روشتة طبية من كلينيك زون\nالمريضة: ${name}\nالأدوية:\n${meds}\nمع تمنياتنا بالشفاء العاجل.`;
            openWhatsApp(phone, msg);
        });
    }

    window.updateBookingStatus = function(id, newStatus) {
        const bookings = getBookings().map(b => {
            if (b.id === id) { b.status = newStatus; playNotificationChime(); }
            return b;
        });
        saveBookings(bookings);
        renderDashboard();
        bc.postMessage('refresh');
    };

    window.selectForRx = function(id) {
        const bookings = getBookings();
        const booking = bookings.find(b => b.id === id);
        if (booking) {
            document.getElementById('presc-name').value = booking.name;
            document.getElementById('presc-phone').value = booking.phone;
            document.getElementById('prescription-section').scrollIntoView();
        }
    };

    // ==========================================
    // POLLING FOR DOCTOR DASHBOARD (fallback sync)
    // ==========================================
    window.startPolling = function() {
        // The 1-second interval is already running globally
        // This function exists for backward compatibility
        // The dashboard updates in real-time via storage event and interval
    };

    // Doctor Image Fallback
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

    // Start the 1-second interval sync
    // Already defined above in the syncInterval variable
});