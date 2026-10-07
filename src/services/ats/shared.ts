/**
 * Shared helpers + defaults used across ATS adapters (Greenhouse, Lever, …).
 * Keeps the medical-role gate, HTML→plain-text conversion and display defaults
 * in one place so every adapter behaves consistently.
 */

// Medical-role keyword gate so we only ingest roles relevant to MedRemote.
export const ROLE_KEYWORDS = [
  // --- Core Clinical & Support ---
  'scribe', 'billing', 'intake', 'telehealth', 'triage', 'remote nurse',
  'clinical', 'virtual assistant', 'medical assistant', 'prior auth',
  'health', 'patient', 'counselor', 'therapist', 'care coordinator',
  'utilization review', 'medical coder',

  // --- Nursing & Advanced Practice ---
  'nurse', 'rn', 'np', 'nurse practitioner', 'lpn', 'lvn', 'case manager',
  'tele-rn', 'tele-health', 'charge nurse', 'clinical navigator',
  'patient navigator', 'care manager', 'care navigator', 'dialysis',

  // --- Therapy, Mental Health & Social Work ---
  'psychiatrist', 'psychologist', 'lcsw', 'lmsw', 'lmft', 'lpc',
  'social worker', 'behavioral health', 'mental health', 'psychiatric',
  'speech therapist', 'slp', 'occupational therapist', 'physical therapist',
  'applied behavior analysis', 'aba therapist', 'rbt', 'autism specialist',
  'substance abuse', 'addiction counselor', 'teletherapy', 'telepsychiatry',

  // --- Medical Practice Specialties & Diagnostics ---
  'physician', 'doctor', 'medical director', 'radiologist', 'radiology',
  'teleradiology', 'pathologist', 'dermatologist', 'cardiologist',
  'pediatric', 'oncology', 'gyn', 'ob/gyn', 'neurology', 'orthopedic',
  'sonographer', 'ultrasound', 'dosimetrist', 'genetic counselor',

  // --- Pharmacy & Diagnostics ---
  'pharmacist', 'pharmacy', 'pharmacy technician', 'pharmtech', 'pharmd',
  'medication therapy', 'toxicology', 'pharmacovigilance',

  // --- Medical Billing, Coding & Revenue Cycle (RCM) ---
  'revenue cycle', 'rcm', 'claims', 'reimbursement', 'health insurance',
  'denial management', 'medical auditor', 'coding specialist', 'ccs', 'rhit',
  'rhia', 'cpc', 'charge capture', 'payment poster', 'credentialing',

  // --- Health Admin, Operations & Patient Services ---
  'patient advocate', 'patient access', 'patient care', 'patient engagement',
  'patient coordinator', 'patient experience', 'clinic coordinator',
  'health coach', 'wellness coach', 'hospice', 'palliative',
  'healthcare operations', 'medical scheduler', 'patient scheduler',

  // --- Health IT, Informatics & Health Tech ---
  'health informatics', 'clinical informatics', 'epic', 'cerner', 'ehr',
  'emr', 'hipaa', 'healthcare data', 'biomedical', 'health tech',
  'digital health', 'medtech', 'clinical analyst', 'health analytics',

  // --- Life Sciences, Biotech & Clinical Research ---
  'cra', 'clinical research', 'clinical trials', 'biostatistician',
  'biostatistics', 'regulatory affairs', 'medical writer', 'medical communications',
  'epidemiologist', 'epidemiology', 'biotech', 'life sciences',
  'clinical data manager', 'msl', 'medical science liaison',

  // --- Quality, Compliance & Risk ---
  'hedis', 'quality improvement', 'clinical quality', 'infection control',
  'healthcare compliance', 'utilization management', 'clinical reviewer',
  'chart auditor', 'risk adjustment', 'radv',
];

export function isTargetMedicalRole(title: string): boolean {
  const t = title.toLowerCase();
  return ROLE_KEYWORDS.some(kw => t.includes(kw));
}

/** Pull a plain-text summary out of an HTML string (Greenhouse content, Lever lists, …). */
export function htmlToText(html?: string | null): string {
  if (!html) return '';
  return html
    // eslint-disable-next-line no-control-regex
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(li|tr|br|p|div|h[1-6])[^>]*>/gi, '\n') // keep list/paragraph breaks
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]*\n+/g, '\n')
    .trim();
}

// Display defaults used when an ATS posting omits these fields.
export const DEFAULT_SALARY = '$900 - $1,800/mo';
export const DEFAULT_SHIFT = 'US Hours (EST/PST)';
export const DEFAULT_QUALIFICATION = 'Degree/Diploma in Nursing or Health Sciences';
export const DEFAULT_CATEGORY = 'Medical Virtual Assistant';