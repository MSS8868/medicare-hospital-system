import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { appointmentAPI, consultationAPI, downloadBlob } from '../../services/api';
import { MdDownload, MdCancel, MdMedicalServices, MdExpandMore, MdExpandLess } from 'react-icons/md';

const STATUS_META = {
  confirmed:   { cls: 'badge-primary',  label: 'Confirmed',  bar: 'var(--primary)' },
  visited:     { cls: 'badge-success',  label: 'Visited',    bar: 'var(--success)' },
  cancelled:   { cls: 'badge-danger',   label: 'Cancelled',  bar: 'var(--danger)'  },
  not_visited: { cls: 'badge-warning',  label: 'Missed',     bar: 'var(--warning)' },
  referred:    { cls: 'badge-purple',   label: 'Referred',   bar: 'var(--purple)'  },
  admitted:    { cls: 'badge-accent',   label: 'Admitted',   bar: 'var(--accent)'  },
};

// Helper: format medicine instruction prominently
function InstructionBadge({ text }) {
  if (!text) return null;
  const t = text.toLowerCase();
  const isAfterFood  = t.includes('after');
  const isBeforeFood = t.includes('before');
  const bg  = isAfterFood  ? '#E8F5E9' : isBeforeFood ? '#FFF3E0' : '#EEE';
  const clr = isAfterFood  ? '#2E7D32' : isBeforeFood ? '#E65100' : '#555';
  return (
    <span style={{ background: bg, color: clr, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

// Inline medicine table shown to patient after consultation
function MedicineTable({ medicines, tests }) {
  if (!medicines?.length && !tests?.length) return null;
  return (
    <div style={{ marginTop: 10 }}>
      {medicines?.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>℞</span> Prescribed Medicines
          </div>
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {medicines.map((med, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', borderBottom: i < medicines.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 0 ? 'white' : '#FAFBFF' }}>
                {/* Medicine number */}
                <div style={{ padding: '10px 10px', borderRight: '1px solid var(--border)', background: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 32 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--success)' }}>{i + 1}</span>
                </div>
                {/* Medicine details */}
                <div style={{ padding: '9px 12px' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>
                    {med.name}
                    {med.dosage && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{med.dosage}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {med.frequency && (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border)' }}>
                        🔄 {med.frequency}
                      </span>
                    )}
                    {med.duration && (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border)' }}>
                        📅 {med.duration}
                      </span>
                    )}
                    {med.instructions && <InstructionBadge text={med.instructions} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tests?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)', marginBottom: 6 }}>🔬 Tests Advised</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tests.map((t, i) => (
              <span key={i} style={{ background: 'var(--purple-light)', color: 'var(--purple)', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>
                {t.name || t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyAppointments() {
  const navigate = useNavigate();
  const [appointments,    setAppointments]    = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [filter,          setFilter]          = useState('all');
  const [cancelModal,     setCancelModal]     = useState(null);
  const [cancelReason,    setCancelReason]    = useState('');
  const [prescDownloading,setPrescDownloading]= useState(null);
  // Track which appointment's prescription is expanded
  const [expandedPresc,   setExpandedPresc]   = useState({});
  // Cache consultation data (medicines etc.) per appointment id
  const [consultCache,    setConsultCache]    = useState({});
  const [loadingConsult,  setLoadingConsult]  = useState({});

  const load = () => {
    setLoading(true);
    appointmentAPI.getAll({ limit: 100 })
      .then(r => setAppointments(r.data.appointments || []))
      .catch(() => toast.error('Failed to load appointments'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const FILTERS = [
    { val: 'all',       label: 'All',       count: appointments.length },
    { val: 'confirmed', label: 'Upcoming',  count: appointments.filter(a => a.status === 'confirmed').length },
    { val: 'visited',   label: 'Completed', count: appointments.filter(a => a.status === 'visited').length },
    { val: 'cancelled', label: 'Cancelled', count: appointments.filter(a => a.status === 'cancelled').length },
  ];

  const filtered = filter === 'all' ? appointments : appointments.filter(a => a.status === filter);

  const handleCancel = async () => {
    if (!cancelReason.trim()) return toast.error('Please provide a reason');
    try {
      await appointmentAPI.updateStatus(cancelModal.id, 'cancelled', cancelReason);
      toast.success('Appointment cancelled');
      setCancelModal(null); setCancelReason(''); load();
    } catch { toast.error('Failed to cancel'); }
  };

  const handleDownloadSlip = async (apt) => {
    try {
      const res = await appointmentAPI.downloadPDF(apt.id);
      downloadBlob(res, `appointment-${apt.appointmentId}.pdf`);
    } catch { toast.error('Failed to download slip'); }
  };

  const handleDownloadPrescription = async (apt) => {
    setPrescDownloading(apt.id);
    try {
      const res = await consultationAPI.downloadPrescription(apt.id);
      downloadBlob(res, `prescription-${apt.appointmentId}.pdf`);
      toast.success('Prescription downloaded');
    } catch (err) {
      toast.error(err.response?.data?.message || 'No prescription available yet');
    } finally { setPrescDownloading(null); }
  };

  // Toggle inline prescription view — fetches consultation data on first expand
  const handleTogglePresc = async (apt) => {
    const key = apt.id;
    const nowExpanded = !expandedPresc[key];
    setExpandedPresc(p => ({ ...p, [key]: nowExpanded }));

    if (nowExpanded && !consultCache[key]) {
      setLoadingConsult(p => ({ ...p, [key]: true }));
      try {
        const res = await consultationAPI.get(apt.id);
        const c   = res.data.consultation;
        if (c) {
          setConsultCache(p => ({
            ...p,
            [key]: {
              medicines:    Array.isArray(c.medicines)    ? c.medicines    : [],
              testsAdvised: Array.isArray(c.testsAdvised) ? c.testsAdvised : [],
              diagnosis:    c.diagnosis || '',
              followUpDate: c.followUpDate || null,
              followUpNotes: c.followUpNotes || '',
            },
          }));
        }
      } catch { toast.error('Could not load prescription details'); }
      finally { setLoadingConsult(p => ({ ...p, [key]: false })); }
    }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="fade-in">
      <div className="page-header-row">
        <div className="page-header">
          <h1>My Appointments</h1>
          <p>Track, manage and download all your appointment records</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/patient/book')}>+ Book New</button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map(f => (
          <button key={f.val} onClick={() => setFilter(f.val)} className={`btn btn-sm ${filter === f.val ? 'btn-primary' : 'btn-outline'}`}>
            {f.label}
            <span style={{ marginLeft: 6, background: filter === f.val ? 'rgba(255,255,255,0.25)' : 'var(--border)', color: filter === f.val ? 'white' : 'var(--text-muted)', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: 60 }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>📅</div>
            <h3>No appointments found</h3>
            <p>Book your first appointment to get started</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/patient/book')}>Book Appointment</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(apt => {
            const meta           = STATUS_META[apt.status] || { cls: 'badge-gray', label: apt.status, bar: 'var(--border)' };
            const canCancel      = apt.status === 'confirmed';
            const hasConsultation= apt.status === 'visited';
            const isPrescDL      = prescDownloading === apt.id;
            const isExpanded     = expandedPresc[apt.id];
            const consult        = consultCache[apt.id];
            const isLoadingC     = loadingConsult[apt.id];

            return (
              <div key={apt.id} className="card" style={{ overflow: 'hidden', padding: 0 }}>
                <div style={{ display: 'flex' }}>
                  {/* Status colour bar */}
                  <div style={{ width: 5, background: meta.bar, flexShrink: 0 }} />

                  <div style={{ flex: 1, padding: '18px 20px' }}>
                    {/* Top row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <div className="avatar" style={{ width: 48, height: 48, fontSize: 15, background: 'var(--primary-50)', color: 'var(--primary)', flexShrink: 0 }}>
                          {apt.doctor?.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{apt.doctor?.user?.name}</div>
                          <div style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>{apt.doctor?.department?.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{apt.doctor?.specialization}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className={`badge ${meta.cls}`} style={{ fontSize: 12 }}>{meta.label}</span>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, fontFamily: 'monospace' }}>{apt.appointmentId}</div>
                        {apt.type === 'follow_up' && <div style={{ marginTop: 4 }}><span className="badge badge-accent" style={{ fontSize: 10 }}>Follow-up</span></div>}
                      </div>
                    </div>

                    {/* Date/time/token */}
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>📅 {format(parseISO(apt.appointmentDate), 'EEEE, dd MMM yyyy')}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>⏰ {apt.appointmentTime}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🎟️ Token #{apt.tokenNumber}</span>
                    </div>

                    {/* Cancel reason */}
                    {apt.cancelReason && (
                      <div style={{ background: 'var(--danger-light)', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>
                        ❌ Reason: {apt.cancelReason}
                      </div>
                    )}

                    {/* Consultation completed notice + inline medicine preview */}
                    {hasConsultation && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ background: 'var(--success-light)', border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <MdMedicalServices size={16} />
                            <span>Consultation completed</span>
                            {consult?.diagnosis && <span style={{ fontWeight: 600 }}>— {consult.diagnosis}</span>}
                          </div>
                          <button onClick={() => handleTogglePresc(apt)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600 }}>
                            {isExpanded ? <><MdExpandLess size={16} /> Hide medicines</> : <><MdExpandMore size={16} /> View prescription</>}
                          </button>
                        </div>

                        {/* Expandable prescription details */}
                        {isExpanded && (
                          <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '12px 14px', background: '#FAFBFF' }}>
                            {isLoadingC ? (
                              <div style={{ textAlign: 'center', padding: '10px 0' }}><span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /></div>
                            ) : consult ? (
                              <MedicineTable medicines={consult.medicines} tests={consult.testsAdvised} />
                            ) : (
                              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>No prescription details available</p>
                            )}
                            {consult?.followUpDate && (
                              <div style={{ marginTop: 10, background: '#FFF8E1', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#E65100', fontWeight: 500 }}>
                                📅 Follow-up: {format(parseISO(consult.followUpDate), 'EEEE, dd MMMM yyyy')}
                                {consult.followUpNotes && <span style={{ color: '#7B5800', marginLeft: 8, fontWeight: 400 }}>— {consult.followUpNotes}</span>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-outline" onClick={() => handleDownloadSlip(apt)}>
                        <MdDownload size={14} /> Appointment Slip
                      </button>
                      {hasConsultation && (
                        <button className="btn btn-sm" style={{ background: 'var(--success)', color: 'white', opacity: isPrescDL ? 0.7 : 1 }}
                          onClick={() => handleDownloadPrescription(apt)} disabled={isPrescDL}>
                          {isPrescDL
                            ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, borderTopColor: 'white' }} /> Downloading...</>
                            : <><MdMedicalServices size={14} /> Download PDF</>}
                        </button>
                      )}
                      {canCancel && (
                        <button className="btn btn-sm btn-danger" onClick={() => setCancelModal(apt)}>
                          <MdCancel size={14} /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="modal-overlay" onClick={() => setCancelModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>Cancel Appointment</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setCancelModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--danger-light)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>
                <strong>{cancelModal.doctor?.user?.name}</strong> on{' '}
                <strong>{format(parseISO(cancelModal.appointmentDate), 'dd MMM yyyy')}</strong> at{' '}
                <strong>{cancelModal.appointmentTime}</strong>
              </div>
              <div className="form-group">
                <label className="form-label required">Reason for cancellation</label>
                <textarea className="form-control" rows={3} placeholder="Please provide a reason..." value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setCancelModal(null)}>Keep Appointment</button>
              <button className="btn btn-danger" onClick={handleCancel}>Confirm Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
