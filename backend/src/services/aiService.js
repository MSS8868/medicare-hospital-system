const fetch = require('node-fetch');
const logger = require('../utils/logger');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Process natural language input from doctor and extract structured consultation data
 */
async function processConsultationInput(text, patientContext = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    logger.warn('Anthropic API key not configured, using mock response');
    return mockProcessConsultation(text);
  }

  const systemPrompt = `You are a medical AI assistant helping doctors document patient consultations in India.
Extract structured information from the doctor's notes and return ONLY valid JSON with this exact structure:
{
  "chiefComplaint": "string or null",
  "symptoms": "string or null - comma-separated symptoms",
  "duration": "string or null - e.g. '3 days', '2 weeks'",
  "diagnosis": "string or null",
  "clinicalNotes": "string or null - additional observations",
  "medicines": [
    {
      "name": "medicine name",
      "dosage": "e.g. 500mg",
      "frequency": "e.g. twice daily",
      "duration": "e.g. 5 days",
      "instructions": "e.g. after food"
    }
  ],
  "testsAdvised": [
    { "name": "test name" }
  ],
  "vitals": {
    "bp": "string or null",
    "pulse": "string or null",
    "temp": "string or null",
    "weight": "string or null",
    "height": "string or null",
    "spo2": "string or null"
  },
  "followUpDate": "YYYY-MM-DD or null",
  "followUpNotes": "string or null"
}

Patient context: ${JSON.stringify(patientContext)}
Return ONLY the JSON object, no markdown, no explanation.`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${err}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '{}';
    const cleaned = content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    logger.error('AI processing error:', err);
    return mockProcessConsultation(text);
  }
}

/**
 * Get patient summary from consultation history
 */
async function getPatientSummary(consultations, patientInfo) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    return mockGetSummary(consultations, patientInfo);
  }

  const systemPrompt = `You are a medical AI assistant. Summarize the patient's medical history concisely for a doctor.
Focus on: key diagnoses, recurring conditions, medications used, allergies, and important trends.
Keep it under 200 words. Use clear medical language appropriate for doctors in India.`;

  const userContent = `Patient: ${patientInfo.name}, Age: ${patientInfo.age}, Blood Group: ${patientInfo.bloodGroup}
Existing Conditions: ${patientInfo.existingConditions || 'None'}
Consultations (${consultations.length} visits): ${JSON.stringify(consultations.slice(-5))}`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    const data = await response.json();
    return data.content?.[0]?.text || 'Unable to generate summary.';
  } catch (err) {
    logger.error('AI summary error:', err);
    return mockGetSummary(consultations, patientInfo);
  }
}

function mockProcessConsultation(text) {
  const lower = text.toLowerCase();
  const medicines = [];
  const tests = [];

  // Simple keyword extraction for demo
  if (lower.includes('paracetamol') || lower.includes('pcm')) medicines.push({ name: 'Paracetamol 500mg', dosage: '500mg', frequency: 'thrice daily', duration: '5 days', instructions: 'after food' });
  if (lower.includes('amoxicillin')) medicines.push({ name: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'twice daily', duration: '7 days', instructions: 'after food' });
  if (lower.includes('antacid') || lower.includes('pantoprazole')) medicines.push({ name: 'Pantoprazole 40mg', dosage: '40mg', frequency: 'once daily', duration: '14 days', instructions: 'before food' });
  if (lower.includes('cbc') || lower.includes('blood test')) tests.push({ name: 'Complete Blood Count (CBC)' });
  if (lower.includes('x-ray') || lower.includes('xray')) tests.push({ name: 'X-Ray' });

  const feverMatch = lower.match(/fever(?:\s+for)?\s+(\d+)\s+(day|week|hour)/);
  const duration = feverMatch ? `${feverMatch[1]} ${feverMatch[2]}s` : null;

  return {
    chiefComplaint: lower.includes('fever') ? 'Fever' : lower.includes('cough') ? 'Cough' : lower.includes('pain') ? 'Pain' : 'As per notes',
    symptoms: text.slice(0, 200),
    duration,
    diagnosis: lower.includes('fever') ? 'Pyrexia - etiology to be determined' : null,
    clinicalNotes: text,
    medicines,
    testsAdvised: tests,
    vitals: {},
    followUpDate: null,
    followUpNotes: null,
  };
}

function mockGetSummary(consultations, patientInfo) {
  return `Patient ${patientInfo.name}, ${patientInfo.age} years, Blood Group: ${patientInfo.bloodGroup || 'Unknown'}.
${patientInfo.existingConditions ? `Known conditions: ${patientInfo.existingConditions}.` : ''}
Total visits: ${consultations.length}.
${consultations.length > 0 ? `Last visit: ${consultations[0]?.visitDate} - ${consultations[0]?.diagnosis || 'No diagnosis recorded'}.` : 'No previous consultation records.'}
Please review complete history for detailed information.`;
}

module.exports = { processConsultationInput, getPatientSummary };
