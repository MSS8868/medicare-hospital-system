import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MdLocalHospital } from 'react-icons/md';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function CompleteProfilePage() {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', age: '', gender: '', bloodGroup: '', address: '',
    emergencyContact: '', emergencyContactName: '', existingConditions: '', email: '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.gender) return toast.error('Name and gender are required');
    setLoading(true);
    try {
      await authAPI.completeProfile(form);
      updateUser({ name: form.name, email: form.email });
      toast.success('Profile completed! Welcome to MediCare.');
      navigate('/patient');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save profile');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 600, background: 'white', borderRadius: 20, boxShadow: '0 8px 40px rgba(13,71,161,0.12)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, #0D47A1, #1565C0)', padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <MdLocalHospital size={28} color="white" />
            <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, color: 'white', fontWeight: 700 }}>MediCare</span>
          </div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', color: 'white', fontSize: 24, fontWeight: 600 }}>Complete Your Profile</h2>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 4 }}>Help us provide better care by filling in your details</p>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 32 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Full Name</label>
              <input className="form-control" placeholder="As on Aadhar/ID" value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-control" type="email" placeholder="Optional" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Age</label>
              <input className="form-control" type="number" min="0" max="150" placeholder="Years" value={form.age} onChange={e => set('age', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label required">Gender</label>
              <select className="form-control" value={form.gender} onChange={e => set('gender', e.target.value)} required>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Blood Group</label>
              <select className="form-control" value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
                <option value="">Select blood group</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Emergency Contact Name</label>
              <input className="form-control" placeholder="Name of contact" value={form.emergencyContactName} onChange={e => set('emergencyContactName', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Emergency Contact Number</label>
            <input className="form-control" type="tel" maxLength={10} placeholder="10-digit mobile" value={form.emergencyContact} onChange={e => set('emergencyContact', e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea className="form-control" rows={2} placeholder="Full address with pincode" value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Existing Medical Conditions</label>
            <textarea className="form-control" rows={2} placeholder="e.g. Diabetes, Hypertension, Asthma (if any)" value={form.existingConditions} onChange={e => set('existingConditions', e.target.value)} />
            <p className="form-hint">This helps doctors understand your medical history</p>
          </div>
          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Saving...' : 'Complete Registration →'}
          </button>
        </form>
      </div>
    </div>
  );
}
