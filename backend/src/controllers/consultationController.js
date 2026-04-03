/**
 * controllers/consultationController.js
 *
 * Handles consultation save/load, AI processing, patient history, and prescription PDF.
 */

const { Consultation, Appointment, Patient, Doctor, User, Department, FollowUp } = require('../models');
const { processConsultationInput, getPatientSummary } = require('../services/aiService');
const { generatePrescriptionPDF } = require('../services/pdfService');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/** Safe JSON parse with a default value */
const parse = (str, def) => {
  try { return JSON.parse(str || JSON.stringify(def)); } catch { return def; }
};

// ── SAVE / UPDATE CONSULTATION ────────────────────────────────────────────────
exports.saveConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const data = req.body;

    const apt = await Appointment.findByPk(appointmentId);
    if (!apt) return res.status(404).json({ success: false, message: 'Appointment not found' });

    // Serialise array/object fields to JSON strings for storage
    const toStr = v => (v && typeof v === 'object') ? JSON.stringify(v) : (v || null);
    const payload = {
      ...data,
      medicines:    toStr(data.medicines),
      testsAdvised: toStr(data.testsAdvised),
      vitals:       toStr(data.vitals),
    };

    const [consult, created] = await Consultation.findOrCreate({
      where:    { appointmentId },
      defaults: {
        id: uuidv4(), appointmentId,
        patientId: apt.patientId, doctorId: apt.doctorId,
        visitDate: apt.appointmentDate,
        ...payload,
      },
    });
    if (!created) await consult.update(payload);

    // Auto-create or update FollowUp when doctor sets a follow-up date
    if (data.followUpDate) {
      const [fu, fuCreated] = await FollowUp.findOrCreate({
        where:    { consultationId: consult.id },
        defaults: {
          id: uuidv4(), consultationId: consult.id, appointmentId,
          patientId:     apt.patientId,
          doctorId:      apt.doctorId,
          followUpDate:  data.followUpDate,
          followUpNotes: data.followUpNotes || '',
          status:        'pending',
          notifiedAt:    new Date(),
        },
      });
      if (!fuCreated) {
        await fu.update({ followUpDate: data.followUpDate, followUpNotes: data.followUpNotes || '' });
      }
    }

    // Mark appointment as visited
    await apt.update({ status: 'visited' });

    res.json({ success: true, message: 'Consultation saved', consultation: consult });
  } catch (err) {
    logger.error('saveConsultation:', err);
    res.status(500).json({ success: false, message: 'Failed to save consultation: ' + err.message });
  }
};

// ── AI TEXT / VOICE PROCESSING ────────────────────────────────────────────────
exports.processAIInput = async (req, res) => {
  try {
    const { text, patientId } = req.body;
    if (!text || text.trim().length < 3)
      return res.status(400).json({ success: false, message: 'Input text too short' });

    // Fetch patient context for AI (age, conditions, allergies, etc.)
    let ctx = {};
    if (patientId) {
      const p = await Patient.findByPk(patientId, {
        include: [{ model: User, as: 'user', attributes: ['name'] }],
      });
      if (p) {
        ctx = {
          name:               p.user?.name,
          age:                p.age,
          gender:             p.gender,
          bloodGroup:         p.bloodGroup,
          existingConditions: p.existingConditions,
          allergies:          p.allergies,
        };
      }
    }

    const structured = await processConsultationInput(text, ctx);
    res.json({ success: true, data: structured });
  } catch (err) {
    logger.error('processAIInput:', err);
    res.status(500).json({ success: false, message: 'AI processing failed: ' + err.message });
  }
};

// ── GET SINGLE CONSULTATION ───────────────────────────────────────────────────
exports.getConsultation = async (req, res) => {
  try {
    const c = await Consultation.findOne({ where: { appointmentId: req.params.appointmentId } });
    if (!c) return res.json({ success: true, consultation: null });

    res.json({
      success:      true,
      consultation: {
        ...c.toJSON(),
        medicines:    parse(c.medicines,    []),
        testsAdvised: parse(c.testsAdvised, []),
        vitals:       parse(c.vitals,       {}),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch consultation: ' + err.message });
  }
};

// ── PATIENT HISTORY + AI SUMMARY ─────────────────────────────────────────────
exports.getPatientHistory = async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await Patient.findByPk(patientId, {
      include: [{ model: User, as: 'user', attributes: ['name', 'mobile', 'email'] }],
    });
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

    const consultations = await Consultation.findAll({
      where:   { patientId },
      include: [{
        model:   Appointment,
        as:      'appointment',
        include: [{
          model:   Doctor,
          as:      'doctor',
          include: [
            { model: User,       as: 'user',       attributes: ['name'] },
            { model: Department, as: 'department' },
          ],
        }],
      }],
      order: [['visitDate', 'DESC']],
    });

    const parsed = consultations.map(c => ({
      ...c.toJSON(),
      medicines:    parse(c.medicines,    []),
      testsAdvised: parse(c.testsAdvised, []),
      vitals:       parse(c.vitals,       {}),
    }));

    const summary = await getPatientSummary(parsed.slice(0, 5), {
      name:               patient.user?.name,
      age:                patient.age,
      bloodGroup:         patient.bloodGroup,
      existingConditions: patient.existingConditions,
    });

    res.json({ success: true, patient, consultations: parsed, aiSummary: summary });
  } catch (err) {
    logger.error('getPatientHistory:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch history: ' + err.message });
  }
};

// ── DOWNLOAD PRESCRIPTION PDF ─────────────────────────────────────────────────
exports.downloadPrescription = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const c = await Consultation.findOne({ where: { appointmentId } });
    if (!c)
      return res.status(404).json({ success: false, message: 'No consultation found. Doctor must save the consultation first.' });

    const apt     = await Appointment.findByPk(appointmentId);
    const patient = await Patient.findByPk(c.patientId, { include: [{ model: User, as: 'user' }] });
    const doctor  = await Doctor.findByPk(c.doctorId,   { include: [{ model: User, as: 'user' }] });

    const obj = {
      ...c.toJSON(),
      medicines:    parse(c.medicines,    []),
      testsAdvised: parse(c.testsAdvised, []),
      vitals:       parse(c.vitals,       {}),
    };

    const pdf = await generatePrescriptionPDF(obj, apt, patient, doctor);
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="prescription-${appointmentId}.pdf"`,
    });
    res.send(pdf);
  } catch (err) {
    logger.error('downloadPrescription:', err);
    res.status(500).json({ success: false, message: 'Failed to generate prescription: ' + err.message });
  }
};
