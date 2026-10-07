export interface QualMapping {
  kenyanName: string;
  kenyanAuthority: string;
  kenyanLevel?: string;
  usMapped?: string;
  usAcronyms?: string[];
  ukMapped?: string;
  euMapped?: string;
  notes?: string;
}

export const KENYA_QUALIFICATIONS_MAP: QualMapping[] = [
  { kenyanName: 'Kenya Registered Community Health Nurse (KRCHN)', kenyanAuthority: 'KNCK', kenyanLevel: 'Diploma', usMapped: 'Certified Medical Assistant (CMA) / Certified Clinical Medical Assistant (CCMA)', usAcronyms: ['CMA (AAMA)', 'CCMA', 'CMAA'], ukMapped: 'NMC Registered Nurse Associate (RNA) – Health Care Support Worker Level 3', euMapped: 'EU Nurse Assistant / Auxiliare Sanitar Level 3', notes: 'KNCK registration verifiable via KNCK portal — map as Clinical Medical Assistant entry level US scribe roles' },
  { kenyanName: 'Kenya Enrolled Registered Midwife (KERM)', kenyanAuthority: 'KNCK', kenyanLevel: 'Diploma', usMapped: 'Licensed Practical Nurse (LPN) with Advanced OB/GYN track', usAcronyms: ['LPN', 'LVN'], ukMapped: 'NMC Registered Midwifery Associate (MW) – level 3)', euMapped: 'Krankenschwesterhelfer (DE) — Ob/Gyn Assist', notes: 'Enrolled Midwife Kenya → LPN/LVN US, 18-24mo transition to LPN/LVN for US tele-triage' },
  { kenyanName: 'Kenya Registered Nurse (KRN) — BScN / Diploma General Nurse', kenyanAuthority: 'KNCK', kenyanLevel: 'Diploma/Bachelor', usMapped: 'Registered Nurse (RN) — CGFNS + NCLEX bridge programs', usAcronyms: ['RN', 'BSN', 'CGFNS'], ukMapped: 'NMC Registered Nurse (Adult / RN) — OSCE route', euMapped: 'Registered Nurse EU — Directive 2005/36/EC Part II' },
  { kenyanName: 'Kenya Registered Critical Care Nurse (KRCCN)', kenyanAuthority: 'KNCK', kenyanLevel: 'Higher Diploma', usMapped: 'Critical Care RN (CCRN) / Progressive Care (PCCN)', usAcronyms: ['CCRN', 'PCCN'], ukMapped: 'NMC Critical Care Nursing Specialty', euMapped: 'EU Critical Care Registered Nurse Level 2' },
  { kenyanName: 'Kenya Registered Pediatric Nurse (KRPN)', kenyanAuthority: 'KNCK', kenyanLevel: 'Higher Diploma', usMapped: 'Pediatric RN Certified Pediatric Nurse (CPN)', usAcronyms: ['CPN', 'PNP-PC'] },
  { kenyanName: 'Kenya Registered Mental Health & Psychiatry Nurse (KRMHN/KRPN-MH)', kenyanAuthority: 'KNCK', kenyanLevel: 'Diploma/HDip', usMapped: 'Psychiatric-Mental Health RN (PMH-RN) / Licensed Professional Counselor associate', usAcronyms: ['PMH-RN', 'LPC'], ukMapped: 'NMC Mental Health Nurse Route' },
  { kenyanName: 'Kenya Registered Peri-Operative Theatre Nurse (KRPON)', kenyanAuthority: 'KNCK', kenyanLevel: 'Higher Diploma', usMapped: 'CNOR Certified Perioperative Nurse / Surgical Tech L3', usAcronyms: ['CNOR', 'CST'] },
  { kenyanName: 'Clinical Officer (General / Diploma / BSc Clinical Medicine)', kenyanAuthority: 'Clinical Officers Council Kenya', kenyanLevel: 'Diploma/Bachelor', usMapped: 'Physician Associate (PA-Prereq) / Medical Scribe Tier-II / Remote Medical Coder CPC', usAcronyms: ['PA', 'CPC', 'CCS-P'], notes: '3-4 yr Kenya Clinical → US scribe leadership tier 2' },
  { kenyanName: 'Medical Laboratory Technician Diploma (KMLTT)', kenyanAuthority: 'KMLTTB', kenyanLevel: 'Diploma', usMapped: 'Medical Laboratory Technician (MLT) ASCPi', usAcronyms: ['MLT (ASCPi)', 'MLS'] },
  { kenyanName: 'Pharmacy Technician Diploma (KPPB)', kenyanAuthority: 'Kenya Pharmacy & Poisons Board', kenyanLevel: 'Diploma', usMapped: 'Certified Pharmacy Technician (CPhT) PTCB', usAcronyms: ['CPhT', 'PTCB'] },
  { kenyanName: 'Dental Technician / Dental Surgery Technician', kenyanAuthority: 'Medical Board', kenyanLevel: 'Diploma', usMapped: 'Dental Assistant (CDA) / Dental Hygienist prereq', usAcronyms: ['CDA', 'DHC'] },
  { kenyanName: 'Health Records & Information Technology Diploma', kenyanAuthority: 'Clinical Officers Council', kenyanLevel: 'Diploma', usMapped: 'Registered Health Information Technician (RHIT) AHIMA / Medical Coder CPC+CCS', usAcronyms: ['RHIT', 'CPC', 'CCS'] },
  { kenyanName: 'Community Health Worker (CHW / CHV)', kenyanAuthority: 'MoH Community', kenyanLevel: 'Certificate', usMapped: 'Community Health Worker (CHW) US BOP' },
  { kenyanName: 'Nutritionist & Dietetics — KND', kenyanAuthority: 'KNDI', kenyanLevel: 'Degree/Diploma', usMapped: 'Dietetic Technician Registered (DTR) ACEND' },
  { kenyanName: 'Medical Secretary Certificate/Diploma', kenyanAuthority: 'KNEC', kenyanLevel: 'Cert/Dip', usMapped: 'Medical Receptionist / Certified Medical Administrative Assistant (CMAA)' },
  { kenyanName: 'Telehealth Triage Certificate Kenya', kenyanAuthority: 'Private / MoH', kenyanLevel: 'Certificate', usMapped: 'Tele-Triage Registered Medical Assistant (TMA) / Medical Call Center L2' },

  { kenyanName: 'TVET HVAC Craft Certificate Level 3 (HVAC Installer)', kenyanAuthority: 'TVET CDACC', kenyanLevel: 'Craft Cert 3', usMapped: 'EPA Section 608 Type I HVAC Technician', usAcronyms: ['EPA 608 T1'], euMapped: 'EU F-Gas Cat I Certificate I', notes: '608 Universal upgrade ~$20 exam remote proctored, huge US remote HVAC dispatcher hire' },
  { kenyanName: 'TVET HVAC Diploma Level 5/6 (BMS & Refrigeration)', kenyanAuthority: 'TVET', kenyanLevel: 'Diploma', usMapped: 'EPA 608 Universal HVAC/R / BMS Technician (Johnson Controls/Siemens BACnet)', usAcronyms: ['EPA 608 Univ', 'BACnet CT'], ukMapped: 'NVQ Level 3 BMS Controls', },
  { kenyanName: 'TVET Building Services Engineering — Chiller & Plant Operations (Diploma Level 5)', kenyanAuthority: 'TVET', kenyanLevel: 'Diploma 5', usMapped: 'Stationary Engineer Class 3 — Chiller Systems / 608 Type II', usAcronyms: ['608 T-II', 'Chiller Op Class 3'] },
  { kenyanName: 'TVET Electrical Installation Level 4/5 — Building Services', kenyanAuthority: 'TVET NITA', kenyanLevel: 'Diploma 4', usMapped: 'Electrical Apprentice / BMS Controls Technician' },
  { kenyanName: 'TVET Plumbing & Pipefitting Level 3/4', kenyanAuthority: 'TVET', kenyanLevel: 'Craft', usMapped: 'Pipefitter Helper / HVAC Plumbing Service Tech' },
  { kenyanName: 'TVET Refrigeration & Air Conditioning Technician — National Certificate/Diploma', kenyanAuthority: 'TVET', kenyanLevel: 'Cert/Dip', usMapped: 'HVAC/R Service Technician — 608 Type II' },

  { kenyanName: 'KNEC Certificate in Medical Reception', kenyanAuthority: 'KNEC', kenyanLevel: 'Cert', usMapped: 'Medical Front Desk Coordinator / Medical Reception (CMAA)', usAcronyms: ['CMAA', 'CMOM'] },
  { kenyanName: 'Diploma in Business Admin & Secretarial (Medical Secretarial)', kenyanAuthority: 'KNEC', kenyanLevel: 'Diploma', usMapped: 'Medical Administrative Assistant / Medical Billing entry' },
  { kenyanName: 'CPB Kenya — Certified Public Bookkeeper', kenyanAuthority: 'KASNEB', kenyanLevel: 'Cert', usMapped: 'QuickBooks ProAdvisor / Billing & Collections Agent', usAcronyms: ['QBO', 'CB (NACPB)'] },
  { kenyanName: 'CPA Kenya Section 1-3 Certified Public Accountant', kenyanAuthority: 'KASNEB', kenyanLevel: 'Cert', usMapped: 'Certified Medical Biller & Coder (CMBS / CPC® dual)', usAcronyms: ['CPC', 'CCS', 'CRC'] },
  { kenyanName: 'Diploma in IT Support & Networks', kenyanAuthority: 'TVET', kenyanLevel: 'Diploma', usMapped: 'CompTIA A+ / Medical IT Support Specialist Google Certificate', usAcronyms: ['A+', 'Google IT Cert'] },
  { kenyanName: 'Certificate in Call Centre & Customer Care', kenyanAuthority: 'KNEC', kenyanLevel: 'Cert', usMapped: 'Customer Service Professional (Virtual US Healthcare Support T1)' },
  { kenyanName: 'Kenya Certificate of Secondary Education (KCSE) C+ / Diploma — any general diploma 3 years', kenyanAuthority: 'KNEC', kenyanLevel: 'KCSE C+ plus Diploma in any field', usMapped: 'High School Diploma Equivalency + US Virtual Scribe program (Scribe 10-week training)', usAcronyms: ['ScribeAcademy'], notes: 'Diploma 3+ yrs any + 6 week US scribe onboarding → Medical Scribe I' },
  { kenyanName: 'Degree — Bachelors of Commerce HRM / Business Admin', kenyanAuthority: 'CUE Kenya Accredited', kenyanLevel: 'Degree 4yr', usMapped: 'Medical Group Practice Manager, US Remote Operations Associate' },
  { kenyanName: 'CPD Kenya — Continuous Medical Education Points', kenyanAuthority: 'All boards', kenyanLevel: 'CPD', usMapped: 'CEUs (Continuing Education Units) US specialty renewal' },
  { kenyanName: 'Nursing Council of Kenya Annual Practicing License', kenyanAuthority: 'KNCK', kenyanLevel: 'Valid renew', usMapped: 'Multistate Compact Nursing License equivalent (map as RN compact), CGFNS route' },
  { kenyanName: 'Kenya Society of Anaesthetists — Anaesthetic Technician', kenyanAuthority: 'KSA', kenyanLevel: 'HDip', usMapped: 'Certified Anesthesia Technician (CerANTECH) ASATT', usAcronyms: ['Cer.A.T (ASATT)'] },
];

export function kenyaQualLookup(name: string): QualMapping | undefined {
  const n = name.trim().toLowerCase();
  return KENYA_QUALIFICATIONS_MAP.find(q => {
    const terms = q.kenyanName.toLowerCase();
    return terms.includes(n) || n.includes(terms.split(' ')[0]!);
  });
}

export const countMappingsCount = KENYA_QUALIFICATIONS_MAP.length;
