import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format, addDays, parseISO } from 'date-fns';
import { deptAPI, doctorAPI, appointmentAPI, downloadBlob } from '../../services/api';
import { MdArrowBack, MdArrowForward, MdDownload, MdCheckCircle } from 'react-icons/md';
import { FiSearch } from 'react-icons/fi';

const STEPS = ['Department', 'Doctor', 'Date & Slot', 'Confirm'];

export default function BookAppointment() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill  = location.state || {};

  const [step,              setStep]              = useState(0);
  const [departments,       setDepartments]       = useState([]);
  const [doctors,           setDoctors]           = useState([]);
  const [slots,             setSlots]             = useState([]);
  const [selectedDept,      setSelectedDept]      = useState(null);
  const [selectedDoctor,    setSelectedDoctor]    = useState(null);
  const [selectedDate,      setSelectedDate]      = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedSlot,      setSelectedSlot]      = useState(null);
  const [lockedSlot,        setLockedSlot]        = useState(null);
  const [lockTimer,         setLockTimer]         = useState(0);
  const [bookedAppointment, setBookedAppointment] = useState(null);
  const [loading,           setLoading]           = useState(false);
  const [slotsLoading,      setSlotsLoading]      = useState(false);
  const [search,            setSearch]            = useState('');
  const [appointmentType,   setAppointmentType]   = useState(prefill.prefillType || 'new');

  useEffect(() => { deptAPI.getAll().then(r => setDepartments(r.data.departments || [])); }, []);

  useEffect(() => {
    if (!prefill.prefillDoctorId || departments.length === 0) return;
    doctorAPI.getById(prefill.prefillDoctorId).then(r => {
      const doc = r.data.doctor;
      setSelectedDoctor(doc);
      const dept = departments.find(d => d.id === doc.departmentId);
      if (dept) setSelectedDept(dept);
      setStep(2);
    }).catch(() => {});
  }, [prefill.prefillDoctorId, departments]);

  useEffect(() => {
    if (!selectedDept) return;
    doctorAPI.getAll({ departmentId: selectedDept.id, isAvailable: true })
      .then(r => setDoctors(r.data.doctors || []));
  }, [selectedDept]);

  // Load ALL slots (available + booked + locked) for visual display
  useEffect(() => {
    if (!selectedDoctor || !selectedDate) return;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot(null);
    appointmentAPI.getSlots(selectedDoctor.id, selectedDate)
      .then(r => setSlots(r.data.slots || []))
      .catch(() => toast.error('Could not load slots'))
      .finally(() => setSlotsLoading(false));
  }, [selectedDoctor, selectedDate]);

  // 3-minute countdown after slot lock
  useEffect(() => {
    if (!lockedSlot) return;
    setLockTimer(180);
    const iv = setInterval(() => {
      setLockTimer(t => {
        if (t <= 1) {
          clearInterval(iv);
          setLockedSlot(null);
          setSelectedSlot(null);
          toast.error('Slot lock expired — please reselect');
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [lockedSlot]);

  const isSlotPast = (slot) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (selectedDate !== today) return false;
    const [h, m] = slot.startTime.split(':').map(Number);
    const st = new Date(); st.setHours(h, m, 0);
    return st <= new Date();
  };

  const handleSelectSlot = async (slot) => {
    if (isSlotPast(slot)) { toast.error('Cannot book past time slots'); return; }
    setSelectedSlot(slot);
    try {
      await appointmentAPI.lockSlot(slot.id);
      setLockedSlot(slot);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Slot just became unavailable');
      setSelectedSlot(null);
    }
  };

  const handleBook = async () => {
    if (!selectedSlot || !selectedDoctor) return;
    setLoading(true);
    try {
      const res = await appointmentAPI.book({ slotId: selectedSlot.id, doctorId: selectedDoctor.id, type: appointmentType });
      setBookedAppointment(res.data.appointment);
      toast.success('Appointment booked!');
      setStep(4);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed — please try again');
    } finally { setLoading(false); }
  };

  const handleDownloadPDF = async () => {
    try {
      const res = await appointmentAPI.downloadPDF(bookedAppointment.id);
      downloadBlob(res, `appointment-${bookedAppointment.appointmentId}.pdf`);
    } catch { toast.error('Failed to download PDF'); }
  };

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(), i);
    return { val: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE'), date: format(d, 'd'), month: format(d, 'MMM'), isToday: i === 0 };
  });

  const filteredDoctors = doctors.filter(d =>
    d.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.specialization?.toLowerCase().includes(search.toLowerCase())
  );

  // Slot counters for the legend
  const slotCounts = {
    available: slots.filter(s => s.status === 'available' && !isSlotPast(s)).length,
    booked:    slots.filter(s => s.status === 'booked').length,
    locked:    slots.filter(s => s.status === 'locked').length,
    past:      slots.filter(s => isSlotPast(s)).length,
  };

  // ── SUCCESS SCREEN ─────────────────────────────────────────────────────────
  if (step === 4 && bookedAppointment) {
    return (
      <div className="fade-in" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ width: 72, height: 72, background: 'var(--success-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <MdCheckCircle size={40} color="var(--success)" />
          </div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 26, marginBottom: 8 }}>Appointment Confirmed!</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28, fontSize: 14 }}>Your appointment has been successfully booked</p>
          <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 20, textAlign: 'left', marginBottom: 24 }}>
            {[
              ['Appointment ID', bookedAppointment.appointmentId],
              ['Token Number',   `#${bookedAppointment.tokenNumber}`],
              ['Doctor',         bookedAppointment.doctor?.user?.name],
              ['Department',     bookedAppointment.doctor?.department?.name],
              ['Date',           format(parseISO(bookedAppointment.appointmentDate), 'EEEE, dd MMMM yyyy')],
              ['Time',           bookedAppointment.appointmentTime],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--primary-50)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--primary)', textAlign: 'left' }}>
            💡 Please arrive 10 minutes early and bring this appointment slip.
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={handleDownloadPDF}><MdDownload /> Download Slip</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => navigate('/patient/appointments')}>My Appointments →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: 740, margin: '0 auto' }}>
      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className={`step-circle ${i < step ? 'done' : i === step ? 'active' : 'pending'}`}>{i < step ? '✓' : i + 1}</div>
              <div className="step-label" style={{ marginTop: 4, fontSize: 11 }}>{s}</div>
            </div>
            {i < STEPS.length - 1 && <div className={`step-line ${i < step ? 'done' : ''}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* STEP 0 — Department */}
      {step === 0 && (
        <div className="card fade-in">
          <div className="card-header">
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>Select Department</h3>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{departments.length} departments</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {departments.map(d => (
                <button key={d.id} onClick={() => { setSelectedDept(d); setSelectedDoctor(null); setSlots([]); setStep(1); }}
                  style={{ padding: '18px 12px', border: `2px solid ${selectedDept?.id === d.id ? d.color : 'var(--border)'}`, borderRadius: 14, background: selectedDept?.id === d.id ? d.color + '18' : 'white', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>{d.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{d.name}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 1 — Doctor */}
      {step === 1 && (
        <div className="card fade-in">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-ghost btn-icon" onClick={() => setStep(0)}><MdArrowBack /></button>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 600 }}>Choose Doctor</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedDept?.name}</p>
              </div>
            </div>
          </div>
          <div className="card-body">
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <FiSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="form-control" style={{ paddingLeft: 36 }} placeholder="Search by name or specialization..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredDoctors.map(doc => (
                <div key={doc.id} className="doctor-card" style={{ display: 'flex', gap: 16, alignItems: 'center', border: selectedDoctor?.id === doc.id ? '2px solid var(--primary)' : '1px solid var(--border)' }} onClick={() => { setSelectedDoctor(doc); setStep(2); }}>
                  <div className="avatar" style={{ width: 54, height: 54, fontSize: 18, background: 'var(--primary-50)', color: 'var(--primary)', flexShrink: 0 }}>
                    {doc.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{doc.user?.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>{doc.specialization}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{doc.qualification}</div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12 }}>⭐ {doc.experience} yrs</span>
                      <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>₹{doc.consultationFee}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>🕐 {doc.slotDuration} min/slot</span>
                    </div>
                  </div>
                  <MdArrowForward color="var(--primary)" size={20} />
                </div>
              ))}
              {filteredDoctors.length === 0 && <div className="empty-state"><p>No doctors found for {selectedDept?.name}</p></div>}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 — Date & Slot */}
      {step === 2 && (
        <div className="card fade-in">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-ghost btn-icon" onClick={() => setStep(prefill.prefillDoctorId ? 0 : 1)}><MdArrowBack /></button>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>{selectedDoctor?.user?.name}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedDoctor?.specialization} · ₹{selectedDoctor?.consultationFee}</p>
              </div>
            </div>
          </div>
          <div className="card-body">
            {/* Date strip */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 20 }}>
              {dates.map(d => (
                <button key={d.val} onClick={() => { setSelectedDate(d.val); setSelectedSlot(null); setLockedSlot(null); }}
                  style={{ minWidth: 62, padding: '10px 8px', borderRadius: 12, flexShrink: 0, border: `2px solid ${selectedDate === d.val ? 'var(--primary)' : 'var(--border)'}`, background: selectedDate === d.val ? 'var(--primary)' : 'white', color: selectedDate === d.val ? 'white' : 'var(--text-primary)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.18s' }}>
                  <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.8 }}>{d.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{d.date}</div>
                  <div style={{ fontSize: 10, opacity: 0.75 }}>{d.month}</div>
                  {d.isToday && <div style={{ fontSize: 9, marginTop: 2, background: 'rgba(255,255,255,0.25)', borderRadius: 4, padding: '1px 4px' }}>Today</div>}
                </button>
              ))}
            </div>

            {/* Slot legend */}
            {slots.length > 0 && (
              <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: 'white', border: '1.5px solid var(--primary)', display: 'inline-block' }} />
                  Available ({slotCounts.available})
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: '#FFCDD2', border: '1.5px solid #E53935', display: 'inline-block' }} />
                  Booked ({slotCounts.booked})
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: '#F5F5F5', border: '1.5px solid #BDBDBD', display: 'inline-block' }} />
                  Locked ({slotCounts.locked})
                </span>
                {slotCounts.past > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: '#EEEEEE', border: '1.5px solid #9E9E9E', display: 'inline-block' }} />
                    Past ({slotCounts.past})
                  </span>
                )}
              </div>
            )}

            {/* Slots */}
            {slotsLoading ? (
              <div className="loading-center" style={{ minHeight: 100 }}><div className="spinner" /></div>
            ) : slots.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>😔</div>
                <p>No slots for {format(parseISO(selectedDate), 'dd MMM')} — try another date</p>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                  {slotCounts.available} of {slots.length} slots available
                </div>
                <div className="slot-grid">
                  {slots.map(s => {
                    const isPast      = isSlotPast(s);
                    const isBooked    = s.status === 'booked';
                    const isLocked    = s.status === 'locked';
                    const isSelected  = selectedSlot?.id === s.id;
                    const unavailable = isPast || isBooked || isLocked;

                    // Visual style based on slot state
                    let slotStyle = {};
                    let labelEl = null;

                    if (isSelected) {
                      slotStyle = { background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' };
                    } else if (isBooked) {
                      slotStyle = { background: '#FFCDD2', color: '#B71C1C', borderColor: '#EF9A9A', cursor: 'not-allowed', textDecoration: 'line-through' };
                      labelEl = <span style={{ display: 'block', fontSize: 9, marginTop: 1, fontWeight: 600, color: '#C62828' }}>Booked</span>;
                    } else if (isLocked) {
                      slotStyle = { background: '#F5F5F5', color: '#9E9E9E', borderColor: '#E0E0E0', cursor: 'not-allowed' };
                      labelEl = <span style={{ display: 'block', fontSize: 9, marginTop: 1, fontWeight: 600, color: '#757575' }}>Locked</span>;
                    } else if (isPast) {
                      slotStyle = { background: '#EEEEEE', color: '#BDBDBD', borderColor: '#E0E0E0', cursor: 'not-allowed' };
                      labelEl = <span style={{ display: 'block', fontSize: 9, marginTop: 1, color: '#BDBDBD' }}>Past</span>;
                    }

                    return (
                      <button
                        key={s.id}
                        className={`slot-btn${isSelected ? ' selected' : ''}`}
                        onClick={() => !unavailable && handleSelectSlot(s)}
                        disabled={unavailable}
                        style={slotStyle}
                        title={isPast ? 'Past time' : isBooked ? 'Already booked' : isLocked ? 'Temporarily held by another user' : `Book ${s.startTime}`}
                      >
                        {s.startTime}
                        {labelEl}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Lock confirmation bar */}
            {selectedSlot && (
              <div style={{ marginTop: 18, background: 'var(--primary-50)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>⏰ {selectedSlot.startTime}</span>
                  {lockedSlot && (
                    <span style={{ fontSize: 12, color: lockTimer < 60 ? 'var(--danger)' : 'var(--warning)', marginLeft: 14, fontWeight: 500 }}>
                      🔒 Reserved for {Math.floor(lockTimer / 60)}:{String(lockTimer % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setStep(3)}>Continue <MdArrowForward size={15} /></button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3 — Confirm */}
      {step === 3 && (
        <div className="card fade-in">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-ghost btn-icon" onClick={() => setStep(2)}><MdArrowBack /></button>
              <h3 style={{ fontSize: 17, fontWeight: 600 }}>Confirm Appointment</h3>
            </div>
          </div>
          <div className="card-body">
            <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              {[
                ['Doctor',           selectedDoctor?.user?.name],
                ['Specialization',   selectedDoctor?.specialization],
                ['Department',       selectedDept?.name],
                ['Date',             format(parseISO(selectedDate), 'EEEE, dd MMMM yyyy')],
                ['Time',             selectedSlot?.startTime],
                ['Consultation Fee', `₹${selectedDoctor?.consultationFee}`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>

            <div className="form-group">
              <label className="form-label">Appointment Type</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[['new', '🆕 New Consultation'], ['follow_up', '🔄 Follow-up Visit']].map(([val, lbl]) => (
                  <button key={val} onClick={() => setAppointmentType(val)}
                    style={{ flex: 1, padding: '11px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 14, border: `2px solid ${appointmentType === val ? 'var(--primary)' : 'var(--border)'}`, background: appointmentType === val ? 'var(--primary-50)' : 'white', fontWeight: appointmentType === val ? 600 : 400, color: appointmentType === val ? 'var(--primary)' : 'var(--text-secondary)', transition: 'all 0.18s' }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {lockedSlot && lockTimer < 90 && (
              <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>
                ⚠️ Slot expires in <strong>{Math.floor(lockTimer / 60)}:{String(lockTimer % 60).padStart(2, '0')}</strong> — confirm now!
              </div>
            )}

            <button className="btn btn-primary btn-block btn-lg" onClick={handleBook} disabled={loading} style={{ marginTop: 8 }}>
              {loading ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Booking...</> : '✅ Confirm & Book Appointment'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
