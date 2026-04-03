import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { patientAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function PatientProfile() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    patientAPI.getMe().then(r => {
      setProfile(r.data.patient);
      setForm({ name: user?.name, email: user?.email, ...r.data.patient });
    }).finally(() => setLoading(false));
  }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await patientAPI.update(form);
      updateUser({ name: form.name, email: form.email });
      toast.success('Profile updated successfully');
      setEditing(false);
      patientAPI.getMe().then(r => setProfile(r.data.patient));
    } catch { toast.error('Failed to update profile'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="fade-in" style={{ maxWidth: 700 }}>
      <div className="page-header-row">
        <div className="page-header"><h1>My Profile</h1><p>Manage your personal and medical information</p></div>
        {!editing
          ? <button className="btn btn-primary" onClick={() => setEditing(true)}>Edit Profile</button>
          : <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--primary-50), #EEF5FF)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="avatar" style={{ width: 64, height: 64, fontSize: 24, background: 'var(--primary)', color: 'white' }}>
              {user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22 }}>{user?.name}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Patient ID: <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{profile?.patientId}</span></p>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{user?.mobile}</p>
            </div>
          </div>
        </div>
        <div className="card-body">
          <h4 style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Personal Information</h4>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              {editing ? <input className="form-control" value={form.name || ''} onChange={e => set('name', e.target.value)} />
                : <div style={{ fontSize: 15, fontWeight: 500 }}>{user?.name}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              {editing ? <input className="form-control" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} />
                : <div style={{ fontSize: 15, fontWeight: 500 }}>{user?.email || '—'}</div>}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Age</label>
              {editing ? <input className="form-control" type="number" value={form.age || ''} onChange={e => set('age', e.target.value)} />
                : <div style={{ fontSize: 15, fontWeight: 500 }}>{profile?.age ? `${profile.age} years` : '—'}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Gender</label>
              {editing ? <select className="form-control" value={form.gender || ''} onChange={e => set('gender', e.target.value)}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select> : <div style={{ fontSize: 15, fontWeight: 500, textTransform: 'capitalize' }}>{profile?.gender || '—'}</div>}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Blood Group</label>
              {editing ? <select className="form-control" value={form.bloodGroup || ''} onChange={e => set('bloodGroup', e.target.value)}>
                <option value="">Select</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b}>{b}</option>)}
              </select> : <div style={{ fontSize: 15, fontWeight: 500 }}>{profile?.bloodGroup || '—'}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Emergency Contact</label>
              {editing ? <input className="form-control" type="tel" maxLength={10} value={form.emergencyContact || ''} onChange={e => set('emergencyContact', e.target.value.replace(/\D/g, ''))} />
                : <div style={{ fontSize: 15, fontWeight: 500 }}>{profile?.emergencyContact || '—'}</div>}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            {editing ? <textarea className="form-control" rows={2} value={form.address || ''} onChange={e => set('address', e.target.value)} />
              : <div style={{ fontSize: 15, fontWeight: 500 }}>{profile?.address || '—'}</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 style={{ fontSize: 16, fontWeight: 600 }}>Medical History</h3></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Existing Medical Conditions</label>
            {editing ? <textarea className="form-control" rows={2} placeholder="e.g. Diabetes, Hypertension" value={form.existingConditions || ''} onChange={e => set('existingConditions', e.target.value)} />
              : <div style={{ fontSize: 15, fontWeight: 500 }}>{profile?.existingConditions || 'None specified'}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Allergies</label>
            {editing ? <textarea className="form-control" rows={2} placeholder="e.g. Penicillin, Aspirin" value={form.allergies || ''} onChange={e => set('allergies', e.target.value)} />
              : <div style={{ fontSize: 15, fontWeight: 500 }}>{profile?.allergies || 'None specified'}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
