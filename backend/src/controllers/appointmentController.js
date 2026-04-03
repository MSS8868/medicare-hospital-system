/**
 * controllers/appointmentController.js
 *
 * Handles slot retrieval, locking, booking, queue and PDF.
 *
 * CHANGE: getSlots now uses getAllSlots() (returns booked+locked+available)
 * so the frontend can show grey/red blocked slots visually.
 * The `includeBooked` query param is now the default behaviour.
 */

const { Op } = require('sequelize');
const {
  Appointment, Patient, Doctor, Department, Slot, User,
} = require('../models');
const { lockSlot: lockSlotFn, getAllSlots, getAvailableSlots } = require('../utils/slotEngine');
const { generateAppointmentPDF } = require('../services/pdfService');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/** Unique appointment ID: APT-YYYYMMDD-XXXX */
function makeAppointmentId() {
  const d  = new Date();
  const dt = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `APT-${dt}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/** Standard JOIN set for appointment queries */
const aptIncludes = [
  { model: Patient, as: 'patient', include: [{ model: User, as: 'user', attributes: ['id', 'name', 'mobile', 'email'] }] },
  { model: Doctor,  as: 'doctor',  include: [{ model: User, as: 'user', attributes: ['id', 'name'] }, { model: Department, as: 'department' }] },
  { model: Slot,    as: 'slot' },
];

// ── GET SLOTS ─────────────────────────────────────────────────────────────────
// Returns ALL slots for the date (available + booked + locked) so the patient
// UI can colour-code each slot (green=free, red=booked, grey=locked).
// Pass ?onlyAvailable=true to get only bookable slots (used by receptionist flow).
exports.getSlots = async (req, res) => {
  try {
    const { doctorId, date, onlyAvailable } = req.query;
    if (!doctorId || !date)
      return res.status(400).json({ success: false, message: 'doctorId and date are required' });

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    let slots;
    if (onlyAvailable === 'true') {
      // Receptionist / admin: only show slots that can be booked
      slots = await getAvailableSlots(doctorId, date, doctor);
    } else {
      // Patient booking page: show all slots with status so UI can colour-code
      slots = await getAllSlots(doctorId, date, doctor);
    }

    res.json({ success: true, slots });
  } catch (err) {
    logger.error('getSlots:', err);
    res.status(500).json({ success: false, message: 'Failed to get slots: ' + err.message });
  }
};

// ── LOCK SLOT ─────────────────────────────────────────────────────────────────
exports.lockSlot = async (req, res) => {
  try {
    const { slotId } = req.body;
    if (!slotId) return res.status(400).json({ success: false, message: 'slotId required' });

    const slot = await lockSlotFn(slotId, req.user.id);
    if (!slot)
      return res.status(409).json({ success: false, message: 'Slot is no longer available — please pick another time' });

    res.json({ success: true, slot, message: 'Slot reserved for 3 minutes' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to lock slot: ' + err.message });
  }
};

// ── BOOK APPOINTMENT ──────────────────────────────────────────────────────────
exports.bookAppointment = async (req, res) => {
  try {
    const { slotId, doctorId, patientId: bodyPatientId, type, notes, isEmergency, bookedBy } = req.body;

    // Resolve patient — receptionist passes patientId directly
    let patient;
    if (bodyPatientId) {
      patient = await Patient.findByPk(bodyPatientId);
    } else {
      patient = await Patient.findOne({ where: { userId: req.user.id } });
    }
    if (!patient)
      return res.status(404).json({ success: false, message: 'Patient profile not found. Please complete your profile first.' });

    // Validate slot
    const slot = await Slot.findByPk(slotId);
    if (!slot || !['available', 'locked'].includes(slot.status))
      return res.status(409).json({ success: false, message: 'This slot is no longer available' });
    if (slot.status === 'locked' && slot.lockedBy !== req.user.id)
      return res.status(409).json({ success: false, message: 'This slot is held by another user' });

    const doctor = await Doctor.findByPk(doctorId, { include: [{ model: Department, as: 'department' }] });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    // Prevent duplicate booking for same patient + doctor + date
    const dup = await Appointment.findOne({
      where: {
        patientId:       patient.id,
        doctorId,
        appointmentDate: slot.date,
        status:          { [Op.notIn]: ['cancelled'] },
      },
    });
    if (dup)
      return res.status(409).json({ success: false, message: 'You already have an appointment with this doctor on this date' });

    const apt = await Appointment.create({
      id:              uuidv4(),
      appointmentId:   makeAppointmentId(),
      patientId:       patient.id,
      doctorId,
      slotId,
      departmentId:    doctor.departmentId,
      appointmentDate: slot.date,
      appointmentTime: slot.startTime,
      tokenNumber:     slot.tokenNumber,
      status:          'confirmed',
      type:            type     || 'new',
      notes:           notes    || null,
      bookedBy:        bookedBy || 'patient',
      isEmergency:     isEmergency || false,
    });

    // Mark slot as booked
    await slot.update({ status: 'booked', lockedAt: null, lockedBy: null });

    const full = await Appointment.findByPk(apt.id, { include: aptIncludes });
    res.status(201).json({ success: true, message: 'Appointment booked successfully', appointment: full });
  } catch (err) {
    logger.error('bookAppointment:', err);
    res.status(500).json({ success: false, message: 'Failed to book appointment: ' + err.message });
  }
};

// ── LIST APPOINTMENTS (role-aware) ────────────────────────────────────────────
exports.getAppointments = async (req, res) => {
  try {
    const { date, status, doctorId, patientId, page = 1, limit = 50 } = req.query;
    const where  = {};
    const offset = (parseInt(page) - 1) * parseInt(limit);

    if (date)   where.appointmentDate = date;
    if (status) where.status = status;

    if (req.user.role === 'patient') {
      const p = await Patient.findOne({ where: { userId: req.user.id } });
      if (!p) return res.json({ success: true, appointments: [], total: 0 });
      where.patientId = p.id;
    } else if (req.user.role === 'doctor') {
      const d = await Doctor.findOne({ where: { userId: req.user.id } });
      if (!d) return res.json({ success: true, appointments: [], total: 0 });
      where.doctorId = d.id;
    } else {
      // receptionist / admin — can filter by any doctor or patient
      if (doctorId)  where.doctorId  = doctorId;
      if (patientId) where.patientId = patientId;
    }

    const { count, rows } = await Appointment.findAndCountAll({
      where,
      include: aptIncludes,
      order:   [['appointmentDate', 'DESC'], ['appointmentTime', 'ASC']],
      limit:   parseInt(limit),
      offset,
    });

    res.json({
      success:      true,
      appointments: rows,
      total:        count,
      pages:        Math.ceil(count / parseInt(limit)),
    });
  } catch (err) {
    logger.error('getAppointments:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch appointments: ' + err.message });
  }
};

// ── GET SINGLE APPOINTMENT ────────────────────────────────────────────────────
exports.getById = async (req, res) => {
  try {
    const apt = await Appointment.findByPk(req.params.id, { include: aptIncludes });
    if (!apt) return res.status(404).json({ success: false, message: 'Appointment not found' });
    res.json({ success: true, appointment: apt });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch appointment: ' + err.message });
  }
};

// ── UPDATE STATUS ─────────────────────────────────────────────────────────────
exports.updateStatus = async (req, res) => {
  try {
    const { status, cancelReason, notes } = req.body;
    const apt = await Appointment.findByPk(req.params.id);
    if (!apt) return res.status(404).json({ success: false, message: 'Appointment not found' });

    // Free the slot when cancelling
    if (status === 'cancelled') {
      const slot = await Slot.findByPk(apt.slotId);
      if (slot) await slot.update({ status: 'available', lockedAt: null, lockedBy: null });
    }

    await apt.update({ status, cancelReason: cancelReason || null, notes: notes || apt.notes });
    res.json({ success: true, message: 'Status updated', appointment: apt });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update status: ' + err.message });
  }
};

// ── TODAY'S QUEUE (doctor / receptionist) ─────────────────────────────────────
exports.getTodayQueue = async (req, res) => {
  try {
    let doctorId;
    if (req.user.role === 'doctor') {
      const doc = await Doctor.findOne({ where: { userId: req.user.id } });
      if (!doc) return res.status(404).json({ success: false, message: 'Doctor profile not found' });
      doctorId = doc.id;
    } else {
      doctorId = req.query.doctorId;
      if (!doctorId) return res.status(400).json({ success: false, message: 'doctorId query param required' });
    }

    const today = new Date().toISOString().split('T')[0];
    const queue = await Appointment.findAll({
      where: {
        doctorId,
        appointmentDate: today,
        status: { [Op.in]: ['confirmed', 'visited', 'not_visited', 'referred', 'admitted'] },
      },
      include: [
        { model: Patient, as: 'patient', include: [{ model: User, as: 'user', attributes: ['id', 'name', 'mobile'] }] },
      ],
      order: [['tokenNumber', 'ASC']],
    });

    res.json({ success: true, queue, total: queue.length, date: today });
  } catch (err) {
    logger.error('getTodayQueue:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch queue: ' + err.message });
  }
};

// ── DOWNLOAD APPOINTMENT PDF ──────────────────────────────────────────────────
exports.downloadPDF = async (req, res) => {
  try {
    const apt = await Appointment.findByPk(req.params.id, { include: aptIncludes });
    if (!apt) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const pdf = await generateAppointmentPDF(apt, apt.patient, apt.doctor, apt.doctor.department, apt.slot);
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="appointment-${apt.appointmentId}.pdf"`,
      'Content-Length':       pdf.length,
    });
    res.send(pdf);
  } catch (err) {
    logger.error('downloadPDF:', err);
    res.status(500).json({ success: false, message: 'Failed to generate PDF: ' + err.message });
  }
};
