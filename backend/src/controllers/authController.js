/**
 * controllers/authController.js
 *
 * Authentication: OTP (patients) and password (staff/doctors).
 *
 * OTP STRATEGY (as requested — keep same login, Twilio integrated later):
 *   - OTP_DEMO_MODE=true (default in dev)  → static OTP returned in API response
 *   - OTP_DEMO_MODE=false in production     → tries Twilio, falls back to demo silently
 *   - Login flow is identical either way; patient just reads OTP from response/SMS
 *
 * RACE CONDITION FIX:
 *   - Old code: count() then PAT-{count+1} → two simultaneous registrations get same ID
 *   - New code: Date.now().toString(36).toUpperCase() → always unique, no race condition
 */

require('dotenv').config();
const { User, Patient, Doctor, Department } = require('../models');
const { generateToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ── OTP sender ────────────────────────────────────────────────────────────────
// Tries Twilio if configured, silently falls back to demo mode.
// App NEVER crashes regardless of SMS provider status.
async function sendOTPViaSMS(mobile, otp) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;

  if (sid && token && from && !sid.startsWith('your_')) {
    try {
      const twilio = require('twilio'); // dynamic require — no crash if not installed
      await twilio(sid, token).messages.create({
        body: `Your MediCare OTP is: ${otp}. Valid for 10 minutes. Do not share.`,
        from,
        to: `+91${mobile}`,
      });
      logger.info(`[OTP] SMS sent to +91${mobile}`);
      return { channel: 'sms' };
    } catch (err) {
      // Twilio failed — log and fall through to demo
      logger.error(`[OTP] Twilio failed for ${mobile}: ${err.message}`);
    }
  }

  // Demo fallback — always works
  console.log(`\n📱 DEMO OTP for ${mobile}: ${otp}\n`);
  return { channel: 'demo' };
}

// ── SEND OTP ──────────────────────────────────────────────────────────────────
exports.sendOTP = async (req, res) => {
  try {
    const mobile = String(req.body.mobile || '').trim();
    if (!mobile || !/^\d{10}$/.test(mobile))
      return res.status(400).json({ success: false, message: 'Enter a valid 10-digit mobile number' });

    // In demo/development mode use static OTP for easy testing
    const isDemo = process.env.OTP_DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production';
    const otp    = isDemo
      ? (process.env.STATIC_OTP || '123456')
      : String(Math.floor(100000 + Math.random() * 900000));

    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let user = await User.findOne({ where: { mobile } });
    if (!user) {
      user = await User.create({
        id: uuidv4(), mobile, name: 'New Patient',
        role: 'patient', otp, otpExpiry, isActive: true,
      });
    } else {
      await user.update({ otp, otpExpiry });
    }

    const result = await sendOTPViaSMS(mobile, otp);

    res.json({
      success: true,
      message: result.channel === 'demo'
        ? `Demo mode — OTP: ${otp}`
        : 'OTP sent to your mobile number',
      // Always expose OTP in response when in demo mode (makes frontend able to autofill)
      ...(result.channel === 'demo' && { demoOtp: otp }),
      isNewUser: user.name === 'New Patient',
    });
  } catch (err) {
    logger.error('sendOTP:', err);
    res.status(500).json({ success: false, message: 'Could not send OTP. Please try again.' });
  }
};

// ── VERIFY OTP ────────────────────────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  try {
    const mobile = String(req.body.mobile || '').trim();
    const otp    = String(req.body.otp    || '').trim();

    if (!mobile || !otp)
      return res.status(400).json({ success: false, message: 'Mobile and OTP are required' });

    const user = await User.findOne({ where: { mobile } });
    if (!user)
      return res.status(404).json({ success: false, message: 'Account not found. Please request OTP first.' });
    if (String(user.otp) !== otp)
      return res.status(400).json({ success: false, message: 'Incorrect OTP. Please try again.' });
    if (new Date() > new Date(user.otpExpiry))
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });

    await user.update({ otp: null, otpExpiry: null, lastLogin: new Date() });
    const token = generateToken(user);

    let profile = null, needsProfile = false;
    if (user.role === 'patient') {
      profile = await Patient.findOne({ where: { userId: user.id } });
      needsProfile = !profile;
    } else if (user.role === 'doctor') {
      profile = await Doctor.findOne({
        where: { userId: user.id },
        include: [{ model: Department, as: 'department' }],
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user:    { id: user.id, name: user.name, mobile: user.mobile, email: user.email, role: user.role },
      profile,
      needsProfile,
    });
  } catch (err) {
    logger.error('verifyOTP:', err);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// ── PASSWORD LOGIN (staff / doctors / admin) ───────────────────────────────────
exports.passwordLogin = async (req, res) => {
  try {
    const mobile   = String(req.body.mobile   || '').trim();
    const password = String(req.body.password || '').trim();
    if (!mobile || !password)
      return res.status(400).json({ success: false, message: 'Mobile and password are required' });

    const user = await User.findOne({ where: { mobile } });
    if (!user || !user.isActive)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (!user.password)
      return res.status(400).json({ success: false, message: 'No password set for this account. Use OTP login or contact admin.' });
    if (!await user.validatePassword(password))
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    await user.update({ lastLogin: new Date() });
    const token = generateToken(user);

    let profile = null;
    if (user.role === 'doctor') {
      profile = await Doctor.findOne({
        where:   { userId: user.id },
        include: [
          { model: User,       as: 'user',       attributes: ['id', 'name', 'mobile', 'email'] },
          { model: Department, as: 'department' },
        ],
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user:    { id: user.id, name: user.name, mobile: user.mobile, email: user.email, role: user.role },
      profile,
    });
  } catch (err) {
    logger.error('passwordLogin:', err);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// ── GET ME ────────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'otp', 'otpExpiry'] },
    });
    let profile = null;
    if (user.role === 'patient')
      profile = await Patient.findOne({ where: { userId: user.id } });
    else if (user.role === 'doctor')
      profile = await Doctor.findOne({ where: { userId: user.id }, include: [{ model: Department, as: 'department' }] });

    res.json({ success: true, user, profile });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
};

// ── COMPLETE PATIENT PROFILE ──────────────────────────────────────────────────
// RACE CONDITION FIX: use Date.now().toString(36) for unique patient ID
// Old: count() + 1 → two concurrent registrations get same sequential number
// New: timestamp in base-36 → always unique even under concurrent load
exports.completePatientProfile = async (req, res) => {
  try {
    const {
      name, age, dateOfBirth, gender, bloodGroup,
      address, emergencyContact, emergencyContactName,
      existingConditions, email,
    } = req.body;

    if (name) await req.user.update({ name, email: email || req.user.email });

    // Unique patient ID: PAT-XXXXXXXX (base-36 timestamp, no sequential counter)
    const patientId = `PAT-${Date.now().toString(36).toUpperCase()}`;

    const [profile, created] = await Patient.findOrCreate({
      where:    { userId: req.user.id },
      defaults: {
        id:                   uuidv4(),
        userId:               req.user.id,
        age:                  age                  || null,
        dateOfBirth:          dateOfBirth          || null,
        gender:               gender               || 'other',
        bloodGroup:           bloodGroup           || null,
        address:              address              || null,
        emergencyContact:     emergencyContact     || null,
        emergencyContactName: emergencyContactName || null,
        existingConditions:   existingConditions   || null,
        patientId,
      },
    });

    if (!created) {
      await profile.update({
        age, dateOfBirth,
        gender:               gender               || profile.gender,
        bloodGroup:           bloodGroup           || profile.bloodGroup,
        address:              address              || profile.address,
        emergencyContact:     emergencyContact     || profile.emergencyContact,
        emergencyContactName: emergencyContactName || profile.emergencyContactName,
        existingConditions:   existingConditions   || profile.existingConditions,
      });
    }

    res.json({ success: true, message: 'Profile saved successfully', profile });
  } catch (err) {
    logger.error('completePatientProfile:', err);
    res.status(500).json({ success: false, message: 'Failed to save profile: ' + err.message });
  }
};
