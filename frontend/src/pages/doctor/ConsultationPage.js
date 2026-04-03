import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { appointmentAPI, consultationAPI, downloadBlob } from '../../services/api';
import { MdSend, MdAutoAwesome, MdAdd, MdDelete, MdDownload, MdSave, MdArrowBack } from 'react-icons/md';
import { FiMic, FiMicOff } from 'react-icons/fi';
import { format, parseISO } from 'date-fns';

const EMPTY_MED  = { name: '', dosage: '', frequency: '', duration: '', instructions: '' };
const EMPTY_TEST = { name: '' };
const EMPTY_FORM = {
  chiefComplaint: '', symptoms: '', duration: '', diagnosis: '', clinicalNotes: '',
  medicines: [{ ...EMPTY_MED }], testsAdvised: [{ ...EMPTY_TEST }],
  vitals: { bp: '', pulse: '', temp: '', weight: '', height: '', spo2: '' },
  followUpDate: '', followUpNotes: '',
};

export default function ConsultationPage() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState(null);
  const [patient, setPatient]         = useState(null);
  const [history, setHistory]         = useState([]);
  const [aiSummary, setAiSummary]     = useState('');
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [aiText, setAiText]           = useState('');
  const [aiProcessing, setAiProc]     = useState(false);
  const [recording, setRecording]     = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [showPatient, setShowPatient] = useState(false); // mobile toggle
  const recognitionRef                = useRef(null);

  const setF     = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setVital = (k, v) => setForm(p => ({ ...p, vitals: { ...p.vitals, [k]: v } }));

  useEffect(() => {
    const load = async () => {
      try {
        const aptRes = await appointmentAPI.getById(appointmentId);
        const apt = aptRes.data.appointment;
        if (!apt) { toast.error('Appointment not found'); navigate('/doctor/queue'); return; }
        setAppointment(apt);

        const [histRes, consultRes] = await Promise.all([
          consultationAPI.getPatientHistory(apt.patientId),
          consultationAPI.get(appointmentId),
        ]);
        setPatient(histRes.data.patient);
        setHistory(histRes.data.consultations || []);
        setAiSummary(histRes.data.aiSummary || '');

        if (consultRes.data.consultation) {
          const c = consultRes.data.consultation;
          setForm({
            chiefComplaint: c.chiefComplaint || '',
            symptoms:       c.symptoms       || '',
            duration:       c.duration       || '',
            diagnosis:      c.diagnosis      || '',
            clinicalNotes:  c.clinicalNotes  || '',
            medicines:    c.medicines?.length    ? c.medicines    : [{ ...EMPTY_MED  }],
            testsAdvised: c.testsAdvised?.length ? c.testsAdvised : [{ ...EMPTY_TEST }],
            vitals:       c.vitals || EMPTY_FORM.vitals,
            followUpDate:   c.followUpDate  || '',
            followUpNotes:  c.followUpNotes || '',
          });
          setSaved(true);
        }
      } catch (err) {
        toast.error('Failed to load: ' + (err.response?.data?.message || err.message));
      } finally { setLoading(false); }
    };
    load();
  }, [appointmentId]);

  const handleAIProcess = async () => {
    if (!aiText.trim()) return toast.error('Enter symptoms or notes first');
    setAiProc(true);
    try {
      const res = await consultationAPI.processAI(aiText, appointment?.patientId);
      const d = res.data.data;
      setForm(prev => ({
        ...prev,
        chiefComplaint: d.chiefComplaint || prev.chiefComplaint,
        symptoms:       d.symptoms       || prev.symptoms,
        duration:       d.duration       || prev.duration,
        diagnosis:      d.diagnosis      || prev.diagnosis,
        clinicalNotes:  d.clinicalNotes  || prev.clinicalNotes,
        medicines:    d.medicines?.length    ? d.medicines    : prev.medicines,
        testsAdvised: d.testsAdvised?.length ? d.testsAdvised : prev.testsAdvised,
        vitals:       { ...prev.vitals, ...(d.vitals || {}) },
        followUpDate:   d.followUpDate  || prev.followUpDate,
        followUpNotes:  d.followUpNotes || prev.followUpNotes,
      }));
      toast.success('AI filled the form — please review');
      setAiText('');
    } catch (err) {
      toast.error('AI failed: ' + (err.response?.data?.message || err.message));
    } finally { setAiProc(false); }
  };

  const toggleRecording = () => {
    const SRC = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SRC) return toast.error('Voice input needs Chrome or Edge browser');
    if (recording) { recognitionRef.current?.stop(); setRecording(false); return; }
    const sr = new SRC();
    sr.lang = 'en-IN'; sr.continuous = true; sr.interimResults = true;
    sr.onresult = e => setAiText(Array.from(e.results).map(r => r[0].transcript).join(' '));
    sr.onerror  = () => { setRecording(false); toast.error('Mic error — check browser permissions'); };
    sr.onend    = () => setRecording(false);
    recognitionRef.current = sr; sr.start(); setRecording(true);
    toast.success('🎤 Listening — speak your notes');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await consultationAPI.save(appointmentId, {
        ...form,
        medicines:    form.medicines.filter(m => m.name?.trim()),
        testsAdvised: form.testsAdvised.filter(t => t.name?.trim()),
      });
      setSaved(true);
      toast.success('Consultation saved!');
      if (form.followUpDate) toast.success(`Follow-up set for ${format(parseISO(form.followUpDate), 'dd MMM yyyy')} — patient notified`, { duration: 4000 });
    } catch (err) {
      toast.error('Save failed: ' + (err.response?.data?.message || err.message));
    } finally { setSaving(false); }
  };

  const handleDownloadPrescription = async () => {
    if (!saved) return toast.error('Save the consultation first');
    try {
      const res = await consultationAPI.downloadPrescription(appointmentId);
      downloadBlob(res, `prescription-${appointment?.appointmentId || appointmentId}.pdf`);
    } catch { toast.error('Failed — save consultation first'); }
  };

  const addMed    = ()        => setForm(p => ({ ...p, medicines: [...p.medicines, { ...EMPTY_MED }] }));
  const updMed    = (i, k, v) => setForm(p => { const m = [...p.medicines]; m[i] = { ...m[i], [k]: v }; return { ...p, medicines: m }; });
  const remMed    = i         => setForm(p => ({ ...p, medicines: p.medicines.filter((_, x) => x !== i) }));
  const addTest   = ()        => setForm(p => ({ ...p, testsAdvised: [...p.testsAdvised, { ...EMPTY_TEST }] }));
  const updTest   = (i, v)    => setForm(p => { const t = [...p.testsAdvised]; t[i] = { name: v }; return { ...p, testsAdvised: t }; });
  const remTest   = i         => setForm(p => ({ ...p, testsAdvised: p.testsAdvised.filter((_, x) => x !== i) }));

  if (loading) return <div className="loading-center"><div className="spinner" /><p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 10 }}>Loading...</p></div>;

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/doctor/queue')}><MdArrowBack /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Consultation Notes</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{patient?.user?.name} · {appointment?.appointmentDate} · Token #{appointment?.tokenNumber}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={handleDownloadPrescription}><MdDownload size={14} /> PDF</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            <MdSave size={14} /> {saving ? 'Saving...' : saved ? 'Update' : 'Save'}
          </button>
        </div>
      </div>

      {saved && (
        <div style={{ background: 'var(--success-light)', border: '1px solid var(--success)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--success)' }}>
          ✅ Saved — patient can download prescription from their portal.
          {form.followUpDate && <strong> Follow-up: {format(parseISO(form.followUpDate), 'dd MMM yyyy')}</strong>}
        </div>
      )}

      {/* Mobile: patient info toggle */}
      <button className="btn btn-outline btn-sm w-full" style={{ marginBottom: 12 }} onClick={() => setShowPatient(p => !p)}>
        {showPatient ? '▲ Hide Patient Info' : '▼ Show Patient Info & History'}
      </button>

      {/* Patient sidebar — collapsible on mobile */}
      {showPatient && patient && (
        <div className="card fade-in" style={{ marginBottom: 14 }}>
          <div style={{ padding: '14px 16px', background: 'var(--primary-50)' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{patient.user?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{patient.patientId} · {patient.user?.mobile}</div>
          </div>
          <div style={{ padding: '10px 16px' }}>
            {[['Age', patient.age ? `${patient.age} yrs` : '—'], ['Gender', patient.gender || '—'], ['Blood Group', patient.bloodGroup || '—'], ['Conditions', patient.existingConditions || 'None'], ['Allergies', patient.allergies || 'None']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ fontWeight: 500, maxWidth: '60%', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
          {aiSummary && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: '#FAFBFF' }}>
              <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginBottom: 4 }}>🤖 AI SUMMARY</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{aiSummary}</div>
            </div>
          )}
          {history.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Previous Visits ({history.length})</div>
              {history.slice(0, 3).map(c => (
                <div key={c.id} style={{ marginBottom: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{c.visitDate} — <span style={{ color: 'var(--primary)' }}>{c.appointment?.doctor?.user?.name}</span></div>
                  <div style={{ color: 'var(--text-muted)' }}>{c.diagnosis || c.chiefComplaint || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Assistant */}
      <div className="card" style={{ marginBottom: 14, border: '2px solid var(--primary-100)' }}>
        <div style={{ padding: '10px 14px', background: 'var(--primary-50)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MdAutoAwesome color="var(--primary)" size={15} />
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--primary)' }}>AI Assistant</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— type or speak notes, AI fills the form</span>
        </div>
        <div style={{ padding: '12px 14px' }}>
          <textarea
            value={aiText} onChange={e => setAiText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleAIProcess(); } }}
            className="form-control" rows={3}
            placeholder='e.g. "Fever 3 days, headache. Prescribe paracetamol 500mg TDS x 5 days. Advise CBC."'
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${recording ? 'btn-danger' : 'btn-outline'}`} onClick={toggleRecording} style={{ flex: '0 0 auto' }}>
              {recording ? <><FiMicOff size={13} /> Stop</> : <><FiMic size={13} /> Voice Input</>}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleAIProcess} disabled={aiProcessing || !aiText.trim()} style={{ flex: 1 }}>
              {aiProcessing ? <><span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Processing...</> : <><MdSend size={13} /> Process with AI (Ctrl+Enter)</>}
            </button>
          </div>
          {recording && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>🔴 Recording... speak clearly then press Stop</p>}
        </div>
      </div>

      {/* Vitals */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header" style={{ padding: '12px 14px' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Vitals</span>
        </div>
        <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          {[['bp', 'BP (mmHg)', '120/80'], ['pulse', 'Pulse (bpm)', '72'], ['temp', 'Temp (°F)', '98.6'], ['weight', 'Wt (kg)', '70'], ['height', 'Ht (cm)', '165'], ['spo2', 'SpO₂ (%)', '98']].map(([k, lbl, ph]) => (
            <div key={k}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{lbl}</label>
              <input className="form-control" style={{ padding: '7px 10px', fontSize: 14 }} placeholder={ph} value={form.vitals[k] || ''} onChange={e => setVital(k, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {/* Clinical details */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header" style={{ padding: '12px 14px' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Clinical Details</span>
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Chief Complaint</label>
              <input className="form-control" placeholder="Main reason for visit" value={form.chiefComplaint} onChange={e => setF('chiefComplaint', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Duration</label>
              <input className="form-control" placeholder="e.g. 3 days" value={form.duration} onChange={e => setF('duration', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Symptoms</label>
            <textarea className="form-control" rows={2} placeholder="List symptoms..." value={form.symptoms} onChange={e => setF('symptoms', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--primary)', fontWeight: 700 }}>Diagnosis</label>
            <input className="form-control" style={{ borderColor: 'var(--primary)', fontWeight: 500 }} placeholder="Primary diagnosis..." value={form.diagnosis} onChange={e => setF('diagnosis', e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Clinical Notes</label>
            <textarea className="form-control" rows={2} placeholder="Additional notes..." value={form.clinicalNotes} onChange={e => setF('clinicalNotes', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Medicines */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header" style={{ padding: '12px 14px' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>℞ Prescription</span>
          <button className="btn btn-sm btn-outline" onClick={addMed}><MdAdd size={14} /> Add</button>
        </div>
        <div style={{ padding: '8px 14px' }}>
          {form.medicines.map((med, i) => (
            <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input className="form-control" style={{ flex: 2, padding: '7px 10px', fontSize: 13 }} placeholder="Medicine name" value={med.name} onChange={e => updMed(i, 'name', e.target.value)} />
                <input className="form-control" style={{ flex: 1, padding: '7px 10px', fontSize: 13 }} placeholder="Dosage" value={med.dosage} onChange={e => updMed(i, 'dosage', e.target.value)} />
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remMed(i)} style={{ color: 'var(--danger)', flexShrink: 0 }}><MdDelete size={15} /></button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-control" style={{ flex: 1, padding: '7px 10px', fontSize: 13 }} placeholder="Frequency (TDS)" value={med.frequency} onChange={e => updMed(i, 'frequency', e.target.value)} />
                <input className="form-control" style={{ flex: 1, padding: '7px 10px', fontSize: 13 }} placeholder="Duration (5d)" value={med.duration} onChange={e => updMed(i, 'duration', e.target.value)} />
                <input className="form-control" style={{ flex: 1, padding: '7px 10px', fontSize: 13 }} placeholder="After food?" value={med.instructions} onChange={e => updMed(i, 'instructions', e.target.value)} />
              </div>
            </div>
          ))}
          {form.medicines.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '6px 0' }}>No medicines yet</p>}
        </div>
      </div>

      {/* Tests + Follow-up */}
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="card">
          <div className="card-header" style={{ padding: '12px 14px' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Tests Advised</span>
            <button className="btn btn-sm btn-outline" onClick={addTest} style={{ padding: '4px 10px' }}><MdAdd size={13} /></button>
          </div>
          <div style={{ padding: '8px 14px' }}>
            {form.testsAdvised.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input className="form-control" style={{ padding: '7px 10px', fontSize: 13 }} placeholder={`Test ${i + 1}`} value={t.name} onChange={e => updTest(i, e.target.value)} />
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remTest(i)} style={{ color: 'var(--danger)', flexShrink: 0 }}><MdDelete size={14} /></button>
              </div>
            ))}
            {form.testsAdvised.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>None added</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ padding: '12px 14px' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Follow-up</span>
          </div>
          <div style={{ padding: '10px 14px' }}>
            <div className="form-group">
              <label className="form-label">Recommended Date</label>
              <input type="date" className="form-control" min={today} value={form.followUpDate} onChange={e => setF('followUpDate', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Instructions for patient</label>
              <textarea className="form-control" rows={2} placeholder="e.g. Review reports..." value={form.followUpNotes} onChange={e => setF('followUpNotes', e.target.value)} />
            </div>
            {form.followUpDate && (
              <div style={{ marginTop: 8, background: 'var(--success-light)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--success)' }}>
                ✅ Patient notified on {format(parseISO(form.followUpDate), 'dd MMM yyyy')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom save bar */}
      <div style={{ display: 'flex', gap: 10, position: 'sticky', bottom: 16, background: 'var(--bg)', padding: '12px 0', zIndex: 10 }}>
        <button className="btn btn-outline" onClick={handleDownloadPrescription} style={{ flex: 1 }}><MdDownload size={15} /> Prescription</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
          <MdSave size={15} /> {saving ? 'Saving...' : saved ? '✅ Update' : 'Save Consultation'}
        </button>
      </div>
    </div>
  );
}
