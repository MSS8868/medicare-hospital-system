import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { format, addDays, parseISO } from 'date-fns';
import { doctorAPI } from '../../services/api';
import { MdAdd, MdDelete, MdCalendarToday, MdSchedule, MdInfo } from 'react-icons/md';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_DAY = i => ({ dayOfWeek: i, startTime: '09:00', endTime: '17:00', breakStart: '13:00', breakEnd: '14:00', isActive: false, maxPatients: 20 });

export default function DoctorSchedule() {
  const [schedules,   setSchedules]   = useState(DAYS.map((_, i) => DEFAULT_DAY(i)));
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [doctorInfo,  setDoctorInfo]  = useState(null);

  // Date override state
  const [overrides,       setOverrides]       = useState([]);
  const [showOverrideForm,setShowOverrideForm]= useState(false);
  const [overrideSaving,  setOverrideSaving]  = useState(false);
  const [deletingDate,    setDeletingDate]    = useState(null);
  const [overrideForm, setOverrideForm] = useState({
    date:       format(new Date(), 'yyyy-MM-dd'),
    isWorking:  true,
    startTime:  '08:00',
    endTime:    '20:00',
    breakStart: '',
    breakEnd:   '',
    reason:     '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [profRes, schedRes, overRes] = await Promise.all([
          doctorAPI.getMyProfile(),
          doctorAPI.getMySchedule(),
          doctorAPI.getMyOverrides().catch(() => ({ data: { overrides: [] } })),
        ]);
        setDoctorInfo(profRes.data.doctor);

        const existing = schedRes.data.schedules || [];
        setSchedules(DAYS.map((_, i) => {
          const found = existing.find(s => s.dayOfWeek === i);
          return found ? { ...found, isActive: found.isActive !== false } : DEFAULT_DAY(i);
        }));

        setOverrides(overRes.data.overrides || []);
      } catch (err) {
        toast.error('Failed to load schedule: ' + (err.response?.data?.message || err.message));
      } finally { setLoading(false); }
    };
    load();
  }, []);

  const toggle = i => setSchedules(p => p.map((s, x) => x === i ? { ...s, isActive: !s.isActive } : s));
  const update = (i, k, v) => setSchedules(p => p.map((s, x) => x === i ? { ...s, [k]: v } : s));

  const handleSave = async () => {
    setSaving(true);
    try {
      const active = schedules.filter(s => s.isActive);
      if (!active.length) { toast.error('Enable at least one working day'); setSaving(false); return; }
      const res = await doctorAPI.updateMySchedule(active);
      const { affectedCount, slotsCleared } = res.data;
      if (affectedCount > 0) {
        toast(`Schedule updated. ${affectedCount} patient(s) notified about the change.`, { icon: '📣', duration: 5000 });
      } else {
        toast.success('Schedule updated successfully');
      }
      if (slotsCleared > 0) toast(`${slotsCleared} future slots cleared — they'll regenerate automatically`, { icon: '🔄' });
    } catch (err) {
      toast.error('Failed to save: ' + (err.response?.data?.message || err.message));
    } finally { setSaving(false); }
  };

  const handleUpsertOverride = async () => {
    if (!overrideForm.date) return toast.error('Date is required');
    if (overrideForm.isWorking && (!overrideForm.startTime || !overrideForm.endTime))
      return toast.error('Start and end time required');

    setOverrideSaving(true);
    try {
      const payload = {
        date:      overrideForm.date,
        isWorking: overrideForm.isWorking,
        reason:    overrideForm.reason || null,
        ...(overrideForm.isWorking && {
          startTime:  overrideForm.startTime,
          endTime:    overrideForm.endTime,
          breakStart: overrideForm.breakStart || null,
          breakEnd:   overrideForm.breakEnd   || null,
        }),
      };
      const res = await doctorAPI.upsertOverride(payload);
      toast.success(res.data.message + ` (${res.data.slotsGenerated} slots generated)`);
      // Refresh overrides list
      const ovRes = await doctorAPI.getMyOverrides();
      setOverrides(ovRes.data.overrides || []);
      setShowOverrideForm(false);
      setOverrideForm({ date: format(new Date(), 'yyyy-MM-dd'), isWorking: true, startTime: '08:00', endTime: '20:00', breakStart: '', breakEnd: '', reason: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save override');
    } finally { setOverrideSaving(false); }
  };

  const handleDeleteOverride = async (date) => {
    setDeletingDate(date);
    try {
      await doctorAPI.deleteOverride(date);
      toast.success('Override removed — slots reverted to weekly schedule');
      setOverrides(p => p.filter(o => o.date !== date));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete override');
    } finally { setDeletingDate(null); }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /><p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>Loading schedule...</p></div>;

  const activeDays = schedules.filter(s => s.isActive).length;

  return (
    <div className="fade-in" style={{ maxWidth: 900 }}>
      <div className="page-header-row" style={{ marginBottom: 20 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>My Schedule</h1>
          <p>Weekly OPD hours · {doctorInfo?.slotDuration || 15} min/slot · <strong>{activeDays}</strong> active days</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving...</> : '✅ Save Schedule'}
        </button>
      </div>

      {/* Info banner */}
      <div style={{ background: 'var(--primary-50)', border: '1px solid var(--primary-100)', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: 'var(--primary)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <MdInfo size={18} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>Changing your schedule?</strong> Patients who have existing appointments outside the new hours will be automatically notified to reschedule.
          Future slots will regenerate with new times when patients book.
        </div>
      </div>

      {/* ── Weekly schedule table ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MdSchedule size={18} color="var(--primary)" />
            <span style={{ fontWeight: 600, fontSize: 15 }}>Weekly Recurring Schedule</span>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['ON', 'DAY', 'OPD HOURS', 'BREAK', 'MAX PATIENTS', 'SLOTS ~'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map((s, i) => {
                const start  = s.startTime  ? parseInt(s.startTime.split(':')[0])  * 60 + parseInt(s.startTime.split(':')[1])  : 540;
                const end    = s.endTime    ? parseInt(s.endTime.split(':')[0])    * 60 + parseInt(s.endTime.split(':')[1])    : 1020;
                const bStart = s.breakStart ? parseInt(s.breakStart.split(':')[0]) * 60 + parseInt(s.breakStart.split(':')[1]) : null;
                const bEnd   = s.breakEnd   ? parseInt(s.breakEnd.split(':')[0])   * 60 + parseInt(s.breakEnd.split(':')[1])   : null;
                const breakMins = (bStart && bEnd) ? Math.max(0, bEnd - bStart) : 0;
                const estSlots  = Math.floor(Math.max(0, end - start - breakMins) / (doctorInfo?.slotDuration || 15));

                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: s.isActive ? (i % 2 === 0 ? 'white' : '#FAFBFF') : 'var(--bg)', opacity: s.isActive ? 1 : 0.55 }}>
                    <td style={{ padding: '12px 14px' }}>
                      <input type="checkbox" checked={s.isActive} onChange={() => toggle(i)} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary)' }} />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontWeight: s.isActive ? 700 : 400, fontSize: 14 }}>{DAYS[i]}</span>
                      {i === 0 && <span style={{ fontSize: 10, color: 'var(--danger)', marginLeft: 6 }}>Sun</span>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="time" className="form-control" style={{ width: 105, padding: '6px 8px', fontSize: 13 }} value={s.startTime || '09:00'} onChange={e => update(i, 'startTime', e.target.value)} disabled={!s.isActive} />
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>to</span>
                        <input type="time" className="form-control" style={{ width: 105, padding: '6px 8px', fontSize: 13 }} value={s.endTime || '17:00'} onChange={e => update(i, 'endTime', e.target.value)} disabled={!s.isActive} />
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <input type="time" className="form-control" style={{ width: 95, padding: '6px 8px', fontSize: 13 }} value={s.breakStart || '13:00'} onChange={e => update(i, 'breakStart', e.target.value)} disabled={!s.isActive} />
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>–</span>
                        <input type="time" className="form-control" style={{ width: 95, padding: '6px 8px', fontSize: 13 }} value={s.breakEnd || '14:00'} onChange={e => update(i, 'breakEnd', e.target.value)} disabled={!s.isActive} />
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <input type="number" className="form-control" style={{ width: 72, padding: '6px 8px', fontSize: 13 }} min="1" max="100" value={s.maxPatients || 20} onChange={e => update(i, 'maxPatients', parseInt(e.target.value))} disabled={!s.isActive} />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {s.isActive ? <span className="badge badge-accent" style={{ fontSize: 12 }}>~{estSlots}</span> : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Off</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Date Overrides section ── */}
      <div className="card">
        <div className="card-header" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MdCalendarToday size={18} color="var(--accent-dark)" />
            <div>
              <span style={{ fontWeight: 600, fontSize: 15 }}>Date-Specific Overrides</span>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Extend or block hours on a single day without changing your weekly schedule.
                Example: work until 8 PM today only, or block a specific holiday.
              </p>
            </div>
          </div>
          <button className="btn btn-sm btn-accent" onClick={() => setShowOverrideForm(p => !p)}>
            <MdAdd size={15} /> {showOverrideForm ? 'Cancel' : 'Add Override'}
          </button>
        </div>

        {/* Override form */}
        {showOverrideForm && (
          <div style={{ padding: '16px 20px', background: '#F0FFF4', borderBottom: '1px solid var(--border)' }} className="fade-in">
            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label required">Date</label>
                <input type="date" className="form-control" min={format(new Date(), 'yyyy-MM-dd')} value={overrideForm.date} onChange={e => setOverrideForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Type</label>
                <select className="form-control" value={overrideForm.isWorking ? 'working' : 'blocked'} onChange={e => setOverrideForm(p => ({ ...p, isWorking: e.target.value === 'working' }))}>
                  <option value="working">✅ Working (extended hours)</option>
                  <option value="blocked">🚫 Blocked (day off)</option>
                </select>
              </div>
            </div>

            {overrideForm.isWorking && (
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label required">Start Time</label>
                  <input type="time" className="form-control" value={overrideForm.startTime} onChange={e => setOverrideForm(p => ({ ...p, startTime: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label required">End Time</label>
                  <input type="time" className="form-control" value={overrideForm.endTime} onChange={e => setOverrideForm(p => ({ ...p, endTime: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Break Start</label>
                  <input type="time" className="form-control" value={overrideForm.breakStart} onChange={e => setOverrideForm(p => ({ ...p, breakStart: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Break End</label>
                  <input type="time" className="form-control" value={overrideForm.breakEnd} onChange={e => setOverrideForm(p => ({ ...p, breakEnd: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Reason (optional — visible in logs)</label>
              <input className="form-control" placeholder={overrideForm.isWorking ? 'e.g. Extended OPD — available extra hours' : 'e.g. Hospital holiday / Conference'} value={overrideForm.reason} onChange={e => setOverrideForm(p => ({ ...p, reason: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowOverrideForm(false)}>Cancel</button>
              <button className="btn btn-accent" onClick={handleUpsertOverride} disabled={overrideSaving}>
                {overrideSaving ? <><span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Saving...</> : '✅ Save Override'}
              </button>
            </div>
          </div>
        )}

        {/* Existing overrides list */}
        {overrides.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <MdCalendarToday size={32} color="var(--border)" />
            <p style={{ marginTop: 8, fontSize: 13 }}>No date overrides. Add one above to extend or block a specific day.</p>
          </div>
        ) : overrides.map(ov => (
          <div key={ov.date} style={{ padding: '13px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 50, height: 50, borderRadius: 10, background: ov.isWorking ? '#E8F5E9' : '#FFEBEE', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 20 }}>{ov.isWorking ? '✅' : '🚫'}</span>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {format(parseISO(ov.date), 'EEEE, dd MMMM yyyy')}
              </div>
              {ov.isWorking ? (
                <div style={{ fontSize: 12, color: 'var(--success)' }}>
                  Working {ov.startTime} – {ov.endTime}
                  {ov.breakStart && ov.breakEnd && ` (break ${ov.breakStart}–${ov.breakEnd})`}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--danger)' }}>Day blocked — no appointments</div>
              )}
              {ov.reason && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{ov.reason}</div>}
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeleteOverride(ov.date)} disabled={deletingDate === ov.date} style={{ color: 'var(--danger)' }}>
              {deletingDate === ov.date ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <MdDelete size={18} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
