/**
 * controllers/patientController.js
 *
 * Handles patient profile, search, follow-ups and in-app notifications.
 *
 * NEW: getMyNotifications, markNotificationRead
 */

const { Op } = require('sequelize');
const {
  Patient, User, Appointment, Doctor, Department,
  Consultation, Slot, FollowUp, Notification,
} = require('../models');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ── Search patients (receptionist / admin / doctor) ───────────────────────────
exports.searchPatients = async (req, res) => {
  try {
    const { mobile, name, patientId } = req.query;
    const userWhere    = {};
    const patientWhere = {};

    if (mobile)    userWhere.mobile    = { [Op.like]: `%${mobile}%` };
    if (name)      userWhere.name      = { [Op.like]: `%${name}%`   };
    if (patientId) patientWhere.patientId = { [Op.like]: `%${patientId}%` };

    const hasUserFilter = Object.keys(userWhere).length > 0;

    const patients = await Patient.findAll({
      where: patientWhere,
      include: [{
        model:      User,
        as:         'user',
        where:      hasUserFilter ? userWhere : undefined,
        attributes: ['id', 'name', 'mobile', 'email'],
        required:   hasUserFilter,
      }],
      limit: 20,
    });
    res.json({ success: true, patients });
  } catch (err) {
    logger.error('searchPatients:', err);
    res.status(500).json({ success: false, message: 'Search failed: ' + err.message });
  }
};

// ── Get patient by id ─────────────────────────────────────────────────────────
exports.getPatient = async (req, res) => {
  try {
    const patient = await Patient.findByPk(req.params.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'mobile', 'email'] }],
    });
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
    res.json({ success: true, patient });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch patient: ' + err.message });
  }
};

// ── My profile (logged-in patient) ───────────────────────────────────────────
exports.getMyProfile = async (req, res) => {
  try {
    const patient = await Patient.findOne({
      where:   { userId: req.user.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'mobile', 'email'] }],
    });
    if (!patient)
      return res.status(404).json({ success: false, message: 'Profile not found. Please complete your profile first.' });

    const appointments = await Appointment.findAll({
      where:   { patientId: patient.id },
      include: [
        { model: Doctor, as: 'doctor', include: [{ model: User, as: 'user', attributes: ['name'] }, { model: Department, as: 'department' }] },
        { model: Slot, as: 'slot' },
      ],
      order: [['appointmentDate', 'DESC']],
      limit: 20,
    });
    res.json({ success: true, patient, appointments });
  } catch (err) {
    logger.error('getMyProfile:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile: ' + err.message });
  }
};

// ── Update profile ────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, age, dateOfBirth, gender, bloodGroup, address, emergencyContact, emergencyContactName, existingConditions, allergies } = req.body;

    if (name || email)
      await req.user.update({ name: name || req.user.name, email: email || req.user.email });

    const patient = await Patient.findOne({ where: { userId: req.user.id } });
    if (!patient) return res.status(404).json({ success: false, message: 'Patient profile not found' });

    await patient.update({ age, dateOfBirth, gender, bloodGroup, address, emergencyContact, emergencyContactName, existingConditions, allergies });
    res.json({ success: true, message: 'Profile updated', patient });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update: ' + err.message });
  }
};

// ── Get my follow-ups ─────────────────────────────────────────────────────────
exports.getMyFollowUps = async (req, res) => {
  try {
    const patient = await Patient.findOne({ where: { userId: req.user.id } });
    if (!patient) return res.json({ success: true, followUps: [] });

    const followUps = await FollowUp.findAll({
      where:   { patientId: patient.id },
      include: [
        { model: Doctor, as: 'doctor', include: [{ model: User, as: 'user', attributes: ['id', 'name'] }, { model: Department, as: 'department' }] },
        { model: Consultation, as: 'consultation', attributes: ['id', 'visitDate', 'diagnosis', 'chiefComplaint'] },
        { model: Appointment,  as: 'sourceAppointment', attributes: ['id', 'appointmentId', 'appointmentDate', 'appointmentTime'] },
      ],
      order: [['followUpDate', 'ASC']],
    });
    res.json({ success: true, followUps });
  } catch (err) {
    logger.error('getMyFollowUps:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch follow-ups: ' + err.message });
  }
};

// ── Respond to follow-up ──────────────────────────────────────────────────────
exports.respondToFollowUp = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rescheduleDate, response } = req.body;

    const fu = await FollowUp.findByPk(id);
    if (!fu) return res.status(404).json({ success: false, message: 'Follow-up not found' });

    const patient = await Patient.findOne({ where: { userId: req.user.id } });
    if (!patient || fu.patientId !== patient.id)
      return res.status(403).json({ success: false, message: 'Not authorized to respond to this follow-up' });

    const updates = { patientResponse: response || '' };
    if (action === 'accept') {
      updates.status = 'accepted';
    } else if (action === 'reject') {
      updates.status = 'rejected';
    } else if (action === 'reschedule') {
      if (!rescheduleDate)
        return res.status(400).json({ success: false, message: 'rescheduleDate is required for reschedule action' });
      updates.status         = 'rescheduled';
      updates.rescheduleDate = rescheduleDate;
    } else {
      return res.status(400).json({ success: false, message: 'action must be one of: accept, reject, reschedule' });
    }

    await fu.update(updates);
    res.json({ success: true, message: `Follow-up ${updates.status}`, followUp: fu });
  } catch (err) {
    logger.error('respondToFollowUp:', err);
    res.status(500).json({ success: false, message: 'Failed to respond: ' + err.message });
  }
};

// ── Get my notifications ──────────────────────────────────────────────────────
exports.getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    const unreadCount = notifications.filter(n => !n.isRead).length;
    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    logger.error('getMyNotifications:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications: ' + err.message });
  }
};

// ── Mark notification(s) as read ─────────────────────────────────────────────
exports.markNotificationsRead = async (req, res) => {
  try {
    const { ids } = req.body; // array of notification ids, or 'all' to mark all

    if (ids === 'all') {
      await Notification.update(
        { isRead: true, readAt: new Date() },
        { where: { userId: req.user.id, isRead: false } }
      );
    } else if (Array.isArray(ids) && ids.length > 0) {
      await Notification.update(
        { isRead: true, readAt: new Date() },
        { where: { id: { [Op.in]: ids }, userId: req.user.id } }
      );
    } else {
      return res.status(400).json({ success: false, message: 'ids must be an array or "all"' });
    }

    res.json({ success: true, message: 'Notifications marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update notifications: ' + err.message });
  }
};
