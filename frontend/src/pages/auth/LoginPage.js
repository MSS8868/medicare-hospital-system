import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiPhone, FiLock, FiArrowRight, FiRefreshCw } from 'react-icons/fi';
import { MdLocalHospital } from 'react-icons/md';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [tab,      setTab]      = useState('patient');
  const [step,     setStep]     = useState(1);
  const [mobile,   setMobile]   = useState('');
  const [otp,      setOtp]      = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [demoOtp,  setDemoOtp]  = useState('');
  const [showPass, setShowPass] = useState(false);

  const switchTab = (t) => { setTab(t); setStep(1); setMobile(''); setOtp(''); setPassword(''); setDemoOtp(''); };

  // ── Send OTP ────────────────────────────────────────────────────────────────
  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(mobile)) return toast.error('Enter a valid 10-digit mobile number');
    setLoading(true);
    try {
      const res = await authAPI.sendOTP(mobile);
      if (res.data.demoOtp) setDemoOtp(res.data.demoOtp);
      toast.success(res.data.message || 'OTP sent!');
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send OTP. Please try again.');
    } finally { setLoading(false); }
  };

  // ── Verify OTP ──────────────────────────────────────────────────────────────
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (otp.length < 4) return toast.error('Enter the OTP you received');
    setLoading(true);
    try {
      const res = await authAPI.verifyOTP(mobile, otp);
      const { token, user, needsProfile } = res.data;
      login(user, token);
      toast.success(`Welcome${user.name && user.name !== 'New Patient' ? ', ' + user.name : ''}! 👋`);
      needsProfile ? navigate('/complete-profile') : navigate('/patient');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP. Please try again.');
    } finally { setLoading(false); }
  };

  // ── Password login ──────────────────────────────────────────────────────────
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(mobile)) return toast.error('Enter a valid 10-digit mobile number');
    if (!password) return toast.error('Enter your password');
    setLoading(true);
    try {
      const res = await authAPI.login(mobile, password);
      const { token, user } = res.data;
      login(user, token);
      toast.success(`Welcome, ${user.name}!`);
      const paths = { doctor: '/doctor', receptionist: '/receptionist', admin: '/admin' };
      navigate(paths[user.role] || '/patient');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid credentials. Please try again.');
    } finally { setLoading(false); }
  };

  const Spinner = () => <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderTopColor: 'white' }} />;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: 'var(--font-body)' }}>

      {/* ── Mobile header bar ── */}
      <div style={{ background: 'var(--primary)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ background: 'rgba(255,255,255,.15)', borderRadius: 10, padding: 8, display: 'flex' }}>
          <MdLocalHospital size={22} color="white" />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', color: 'white', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>MediCare</div>
          <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 11, marginTop: 2 }}>Multi-Specialty Hospital</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* ── Desktop left-panel info — shown only on wider screens ── */}
          <div style={{ background: 'linear-gradient(135deg,#0D47A1,#1565C0)', borderRadius: 'var(--radius-xl)', padding: '20px 22px', marginBottom: 20, display: 'none' }} className="login-feature-panel">
            <h2 style={{ fontFamily: 'var(--font-display)', color: 'white', fontSize: 20, marginBottom: 12 }}>Smart Healthcare</h2>
            {['Book appointments in under 30 seconds','Real-time slot availability','AI-powered consultation notes','Secure patient records'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,.85)', fontSize: 13, marginBottom: 8 }}>
                <span style={{ background: 'rgba(255,255,255,.2)', borderRadius: 5, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</span>
                {f}
              </div>
            ))}
          </div>

          {/* ── Login card ── */}
          <div style={{ background: 'white', borderRadius: 'var(--radius-xl)', padding: '28px 24px', boxShadow: '0 8px 40px rgba(13,71,161,.12)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Welcome Back</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 22 }}>Sign in to your account</p>

            {/* Tab switcher */}
            <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 10, padding: 4, marginBottom: 22, gap: 4 }}>
              {[{ id: 'patient', label: '🧑‍⚕️ Patient' }, { id: 'staff', label: '👨‍💼 Staff / Doctor' }].map(t => (
                <button key={t.id} onClick={() => switchTab(t.id)}
                  style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, transition: 'all .2s', background: tab === t.id ? 'white' : 'transparent', color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)', boxShadow: tab === t.id ? '0 2px 8px rgba(13,71,161,.1)' : 'none', minHeight: 40 }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Patient OTP flow ── */}
            {tab === 'patient' && (
              <div className="fade-in">
                {step === 1 && (
                  <form onSubmit={handleSendOTP}>
                    <div className="form-group">
                      <label className="form-label required">Mobile Number</label>
                      <div style={{ position: 'relative' }}>
                        <FiPhone style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 16 }} />
                        <input className="form-control" style={{ paddingLeft: 40 }}
                          type="tel" inputMode="numeric" pattern="[0-9]*" placeholder="Enter 10-digit mobile" maxLength={10}
                          value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, ''))} required autoFocus />
                      </div>
                    </div>
                    <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
                      {loading ? <Spinner /> : <>Get OTP <FiArrowRight /></>}
                    </button>
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>OTP will be sent to your mobile number</p>
                  </form>
                )}
                {step === 2 && (
                  <form onSubmit={handleVerifyOTP}>
                    <div style={{ background: 'var(--primary-50)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>OTP sent to <strong>+91 {mobile}</strong></span>
                      <button type="button" onClick={() => { setStep(1); setOtp(''); setDemoOtp(''); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        <FiRefreshCw size={12} /> Change
                      </button>
                    </div>
                    {demoOtp && (
                      <div style={{ background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#7B5800' }}>
                        🧪 Demo OTP: <strong style={{ fontSize: 18, letterSpacing: 3 }}>{demoOtp}</strong>
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label required">Enter OTP</label>
                      <input className="form-control"
                        style={{ fontSize: 24, letterSpacing: 10, textAlign: 'center', fontWeight: 700 }}
                        type="tel" inputMode="numeric" pattern="[0-9]*" placeholder="••••••" maxLength={6}
                        value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} required autoFocus />
                    </div>
                    <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading || otp.length < 4}>
                      {loading ? <Spinner /> : 'Verify & Login'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* ── Staff password flow ── */}
            {tab === 'staff' && (
              <form onSubmit={handlePasswordLogin} className="fade-in">
                <div className="form-group">
                  <label className="form-label required">Mobile Number</label>
                  <div style={{ position: 'relative' }}>
                    <FiPhone style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 16 }} />
                    <input className="form-control" style={{ paddingLeft: 40 }}
                      type="tel" inputMode="numeric" pattern="[0-9]*" placeholder="Registered mobile" maxLength={10}
                      value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, ''))} required autoFocus />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label required">Password</label>
                  <div style={{ position: 'relative' }}>
                    <FiLock style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 16 }} />
                    <input className="form-control" style={{ paddingLeft: 40, paddingRight: 44 }}
                      type={showPass ? 'text' : 'password'} placeholder="Enter password"
                      value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="button" onClick={() => setShowPass(p => !p)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 4 }}>
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
                  {loading ? <Spinner /> : <>Sign In <FiArrowRight /></>}
                </button>
                <div style={{ background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 8, padding: '10px 14px', marginTop: 16, fontSize: 12, color: '#7B5800', lineHeight: 1.8 }}>
                  <strong>Demo Credentials:</strong><br />
                  Admin: 9999999999 / Admin@123<br />
                  Receptionist: 9888888888 / Recep@123<br />
                  Doctors: 9800000001–17 / Doctor@123
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
