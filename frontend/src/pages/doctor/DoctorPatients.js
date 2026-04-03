import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { patientAPI, consultationAPI } from '../../services/api';
import { FiSearch } from 'react-icons/fi';
import { MdHistory, MdPerson, MdClose } from 'react-icons/md';
import { format, parseISO } from 'date-fns';

export default function DoctorPatients() {
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await patientAPI.search({ mobile: search, name: search });
      setPatients(res.data.patients || []);
      if (res.data.patients?.length === 0) toast('No patients found', { icon: '🔍' });
    } catch {
      toast.error('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (patient) => {
    if (selected?.id === patient.id) { setSelected(null); setHistoryData(null); return; }
    setSelected(patient);
    setHistoryData(null);
    setHistoryLoading(true);
    try {
      const res = await consultationAPI.getPatientHistory(patient.id);
      setHistoryData(res.data);
    } catch {
      toast.error('Failed to load patient history');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Patient Lookup</h1>
        <p>Search by mobile number or patient name to view history</p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <FiSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-control"
            style={{ paddingLeft: 38 }}
            placeholder="Search by mobile (10 digits) or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading || !search.trim()}>
          {loading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Search'}
        </button>
      </form>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Patient list */}
        <div>
          {patients.length > 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>{patients.length} patient{patients.length > 1 ? 's' : ''} found</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {patients.map(p => (
              <div
                key={p.id}
                className="card"
                style={{ padding: '14px 18px', cursor: 'pointer', border: selected?.id === p.id ? '2px solid var(--primary)' : '1px solid var(--border)', transition: 'all 0.18s' }}
                onClick={() => loadHistory(p)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="avatar" style={{ width: 42, height: 42, fontSize: 15, background: 'var(--primary-50)', color: 'var(--primary)', flexShrink: 0 }}>
                    {p.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.user?.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      📱 {p.user?.mobile} &nbsp;·&nbsp; {p.patientId}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                      {p.age ? `Age: ${p.age}` : ''} {p.gender ? `· ${p.gender}` : ''} {p.bloodGroup ? `· ${p.bloodGroup}` : ''}
                    </div>
                  </div>
                  <div style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 500 }}>
                    {selected?.id === p.id ? '▲ Hide' : '▼ History'}
                  </div>
                </div>
                {p.existingConditions && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)', background: 'var(--danger-light)', borderRadius: 6, padding: '4px 10px' }}>
                    ⚠️ {p.existingConditions}
                  </div>
                )}
              </div>
            ))}
            {searched && patients.length === 0 && (
              <div className="empty-state">
                <MdPerson size={40} color="var(--border)" />
                <h3 style={{ marginTop: 10 }}>No patients found</h3>
                <p>Try searching with mobile number or full name</p>
              </div>
            )}
          </div>
        </div>

        {/* Patient history panel */}
        <div>
          {selected && (
            <div style={{ position: 'sticky', top: 80 }}>
              {/* Header */}
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ padding: '16px 18px', background: 'linear-gradient(to right, var(--primary-50), #EEF5FF)', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.user?.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{selected.patientId} · {selected.user?.mobile}</div>
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setSelected(null); setHistoryData(null); }}>
                    <MdClose size={16} />
                  </button>
                </div>

                {/* AI Summary */}
                {historyLoading ? (
                  <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
                ) : historyData?.aiSummary && (
                  <div style={{ padding: '12px 18px', background: '#FAFBFF', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--primary-100)' }}>
                    <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>🤖 AI Summary</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{historyData.aiSummary}</div>
                  </div>
                )}
              </div>

              {/* Consultation history */}
              {!historyLoading && historyData && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                    {historyData.consultations?.length || 0} consultation record{historyData.consultations?.length !== 1 ? 's' : ''}
                  </p>
                  {historyData.consultations?.length === 0 && (
                    <div className="card"><div className="empty-state" style={{ padding: 32 }}><p>No previous consultation records</p></div></div>
                  )}
                  {historyData.consultations?.map(c => (
                    <div key={c.id} className="card" style={{ marginBottom: 10 }}>
                      <div style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {c.visitDate && format(parseISO(c.visitDate), 'dd MMM yyyy')}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--primary)' }}>{c.appointment?.doctor?.user?.name}</span>
                      </div>
                      <div style={{ padding: '10px 16px', fontSize: 13 }}>
                        {c.diagnosis && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Diagnosis</span>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 1 }}>{c.diagnosis}</div>
                          </div>
                        )}
                        {c.chiefComplaint && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Chief Complaint: </span>
                            <span>{c.chiefComplaint}</span>
                          </div>
                        )}
                        {c.medicines?.length > 0 && (
                          <div style={{ marginBottom: 4 }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Rx: </span>
                            <span style={{ color: 'var(--text-secondary)' }}>{c.medicines.map(m => m.name).filter(Boolean).join(', ')}</span>
                          </div>
                        )}
                        {c.followUpDate && (
                          <div style={{ marginTop: 6, background: 'var(--primary-50)', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: 'var(--primary)' }}>
                            Follow-up: {format(parseISO(c.followUpDate), 'dd MMM yyyy')} {c.followUpNotes && `— ${c.followUpNotes}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {!selected && (
            <div className="empty-state" style={{ paddingTop: 60 }}>
              <MdHistory size={44} color="var(--border)" />
              <h3 style={{ marginTop: 12 }}>Select a patient</h3>
              <p>Search and click on a patient to view their complete history</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
