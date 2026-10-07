import { PrismaClient, Role, PaymentTier, ApplyStage, AffiliateTier, PaymentStatus, AppSource } from '@prisma/client';
import bcrypt from 'bcryptjs';

type MatchReason = 'EXACT_SKILL' | 'CERT_EQUIVALENT' | 'KENYA_EXPERIENCE_MAPPED' | 'KEYWORD_HIT' | 'LOCATION_OPEN';

const prisma = new PrismaClient();

const ONE_DAY_MS = 86_400_000;

async function main() {
  console.log('[prisma/seed] Starting additive seed...');

  // ---------- Clear old seed data for idempotency (safe additive — delete by seeded email/phone only) --------------------
  // First find existing seeded userId by email — because LlmCallAudit / SavedJob have no User relation, only userId loose FK
  const existingSeededUsers = await prisma.user.findMany({ where: { email: 'john@kipruto.ke' }, select: { id: true } });
  const seededUserIds = existingSeededUsers.map(u => u.id);

  await prisma.$transaction([
    prisma.savedJob.deleteMany({ where: { userId: { in: seededUserIds } } }),
    prisma.llmCallAudit.deleteMany({ where: { userId: { in: seededUserIds } } }),
    prisma.jobMatch.deleteMany({ where: { userId: { in: seededUserIds } } }),
    prisma.payout.deleteMany({ where: { affiliate: { userId: { in: seededUserIds } } } }),
    prisma.referralEvent.deleteMany({ where: { affiliate: { userId: { in: seededUserIds } } } }),
    prisma.coverLetter.deleteMany({ where: { application: { userId: { in: seededUserIds } } } }),
    prisma.resumeVersion.deleteMany({ where: { userId: { in: seededUserIds } } }),
    prisma.application.deleteMany({ where: { userId: { in: seededUserIds } } }),
    prisma.affiliate.deleteMany({ where: { userId: { in: seededUserIds } } }),
    prisma.payment.deleteMany({ where: { userId: { in: seededUserIds } } }),
    prisma.job.deleteMany({ where: { sourceAgency: 'MEDREMOTE_SEED_V1' } }),
    prisma.employer.deleteMany({ where: { email: { in: ['seed-employer@medremote.ke', 'seed-employer-hvac@medremote.ke'] } } }),
    prisma.user.deleteMany({ where: { email: 'john@kipruto.ke' } }),
  ]);
  console.log('[prisma/seed] Old seed data purged for idempotency.');

  // ---------- User John Kipruto demo (BASIC SUBSCRIBER — $5/mo tier = 10 rewrites, 30 applies) ----------------------------
  const passwordHash = await bcrypt.hash('MedRemote2026!', 10);
  const user = await prisma.user.create({
    data: {
      id: '9f8e7d6c-5b4a-4000-8000-00000000000a',
      firstName: 'John',
      lastName: 'Kipruto',
      phoneNumber: '254712345678',
      email: 'john@kipruto.ke',
      passwordHash,
      googleId: null,
      source: AppSource.ONBOARDING_FORM,
      country: 'Kenya',
      role: Role.SUBSCRIBER,
      profileHeadline: 'KNCK Registered Community Nurse → US CMA Medical Scribe / Tele-Triage L2',
      rawResumeText:
`John Kipruto
0712 345678 | john@kipruto.ke | Eldoret, Kenya

PROFESSIONAL
Kenya Registered Community Health Nurse (KRCHN), KNCK Reg #KR-872345
Diploma in Community Health Nursing, KMTC Eldoret, Class of 2021
6 Years full-time experience:
* Outpatient Department Triage — Moi Teaching and Referral Hospital, Eldoret
* Average 45 patients/day triaged using SOAP notes, vitals entry in KenyaEMR
* KNCK Annual Practicing License active, renewed March 2026
* 200+ CPD points, KNCK CPD cycles up-to-date.

CERTIFICATIONS
1. Kenya Registered Community Health Nurse (KNCK Level — Diploma)
2. TVET Certificate in Medical Reception, KNEC Grade: Credit, 2020
3. HIPAA Awareness Certificate — Medscape CME, April 2026

SKILLS
Triage, Patient registration, KenyaEMR, SOAP Documentation,
Tele-triage phone support, Vaccination recording, Phlebotomy basics,
Patient followup calls, M-Pesa patient payment processing reception desk,
English / Kiswahili / Kalenjin trilingual medical interpreter.

TARGET: US Remote Virtual Medical Scribe tier II — $16/hr — 9pm-5am Kenya time.
`,
      rewrittenResumeMarkdown:
`# John Kipruto — CMA (AAMA) Medical Scribe, KNCK Registered Nurse

> Eldoret, Kenya · +254 712 345 678 · john@kipruto.ke
> **Kenya → US ATS Standard** rewrite — KNCK Level 5 mapped to Certified Medical Assistant (AAMA) equivalent.
> **Target role:** Remote US Medical Scribe Tier II / Tele-Triage L2 — Work from home Kenya

## Professional Summary
KNCK Registered Community Health Nurse with 6+ years triaging ~45 patients/day in a busy 800-bed Kenyan referral hospital. Skilled in real-time SOAP documentation, KenyaEMR navigation, HIPAA-compliant patient messaging, and trilingual (English / Kiswahili / Kalenjin) clinical interpretation. Active KNCK license (#KR-872345), 200+ CPD points, recent HIPAA CME Medscape certification. Transitioning to US remote medical scribe / tele-triage tier-II roles.

## Core Skills
HIPAA Compliance, Tele-Triage, SOAP Notes, Patient Triage,
Clinical Documentation Improvement (CDI), Epic navigation (training completed: ScribeAcademy 6 weeks, 2026),
Medical Terminology Anatomy/Physiology, Vitals Entry, Phlebotomy, Vaccination Recording,
KenyaEMR / Athena, Patient Follow-up Calls, English/Kiswahili/Kalenjin Interpreter.

## Experience
### Outpatient Triage Nurse, Moi Teaching and Referral Hospital Eldoret
Eldoret, KE · 2021 – Present
- **Triaged 45+ patients daily**, SOAP charted vitals, chief complaint, ROS and physical exam findings into KenyaEMR with 98.5% accuracy over 24 months.
- **Led 2-hour evening tele-triage clinic pilot** (phone + SMS follow-up), reducing post-discharge 7-day readmission rates for diabetes patients by 19%.
- **Championed HIPAA privacy training** for 15 new nurses during onboarding in Q1 2026, authoring facility cheat-sheets for minimum necessary PHI rule.
- **Coordinated M-Pesa outpatient desk payments** for KES 200 consultation fee; reconciled 2,000+ transactions monthly with 0 discrepancies.
- **Mentored 3 student nurse interns** each intake (Jan, May, Sep) on bedside manner + charting discipline.

## Certifications
1. KNCK Registered Community Health Nurse (KRCHN) → **US equivalent: Certified Medical Assistant (CMA, AAMA)** (license #KR-872345, active through March 2027)
2. TVET Medical Reception Certificate, KNEC Credit (2020)
3. HIPAA Awareness CME — Medscape (April 2026, 2.0 CEUs)
4. ScribeAcademy Medical Scribe Tier II Certified (March 2026, 6 weeks)
`,
      rewrittenResumeBlobUrlPdf: null,
      rewrittenResumeBlobUrlDocx: null,
      atsScore: 91,
      atsAudit: {
        checklist: [
          { label: 'Has KNCK/TVET cert mapped to US equivalent', ok: true },
          { label: 'HIPAA compliance keyword present', ok: true },
          { label: 'Action verbs used ≥8 in Experience bullets', ok: true, tip: 'Triaged, Led, Championed, Coordinated, Mentored.' },
          { label: 'SOAP / EHR keyword present', ok: true },
          { label: 'ATS quantifiable impact metrics (numbers, %, etc)', ok: true },
        ],
      },
      skills: [
        'Clinical Scribe', 'KNCK Registered', 'KRCHN', 'HIPAA trained', 'SOAP documentation', 'Medical terminology',
        'Tele-triage', 'Patient registration', 'KenyaEMR', 'Athena', 'Vitals entry', 'Phlebotomy basics',
        'Kiswahili Medical Interpreter', 'M-Pesa patient payments', 'CPD points current',
      ],
      certifications: [
        { name: 'Kenya Registered Community Health Nurse (KRCHN)', year: 2021, mappedUsCert: 'CMA (AAMA) / Certified Clinical Medical Assistant', mappedUkCert: 'NMC Associate Nurse', licenseNo: 'KR-872345' },
        { name: 'TVET Medical Reception Certificate, KNEC Credit', year: 2020, mappedUsCert: 'CMAA — Certified Medical Administrative Assistant' },
        { name: 'HIPAA Privacy & Security CME (Medscape)', year: 2026, mappedUsCert: 'HIPAA Certified' },
        { name: 'ScribeAcademy Medical Scribe Tier II', year: 2026, mappedUsCert: 'Scribe Certified Tier II' },
      ],
      preferredShifts: ['Night Shift 9pm-5am EAT (US Daytime)', 'Weekend 12 hour shift coverage'],
      preferredCountries: ['US', 'UK', 'EU Remote', 'Canada (Remote)'],
      minMonthlyCompensation: 210_000,
      lastLoggedInAt: new Date(),
      tier: PaymentTier.BASIC,
      jobTitleTarget: 'Remote US Medical Scribe Tier II / Tele-Triage L2',
      yearsExperience: 6,
      subscriptionEndsAt: new Date(Date.now() + 30 * ONE_DAY_MS),
      autoRenewSubscription: true,
    },
  });
  console.log('[prisma/seed] User created:', user.id, '| tier:', user.tier, '| role:', user.role, '| ATS Score:', user.atsScore);

  // ---------- Affiliate row for John (auto referral code MR-KENYA6) ------------------------------------------------------
  const affiliate = await prisma.affiliate.create({
    data: {
      id: 'aff-seed-john-0001',
      userId: user.id,
      referralCode: 'MRJOHN6',
      landingPageUrl: 'https://medremote.vercel.app/?ref=MRJOHN6',
      conversions: 0,
      clicks: 0,
      totalEarnedDecimal: 0,
      pendingPayoutDecimal: 0,
      tier: AffiliateTier.BRONZE,
    },
  });
  // Seed 2 ReferralEvents: CLICK + SIGNUP demo (processPaymentSuccessEvent T8 will create PAYMENT on webhook fire)
  await prisma.referralEvent.createMany({
    data: [
      { id: 're-seed-0001-click', affiliateId: affiliate.id, referredUserId: null, newPaymentId: null, kind: 'CLICK', ip: '105.27.123.45', ua: 'Mozilla/5.0 iPhone 15 Kenya Safaricom', commissionAmountDecimal: null, createdAt: new Date(Date.now() - 5 * ONE_DAY_MS) },
      { id: 're-seed-0002-signup', affiliateId: affiliate.id, referredUserId: null, newPaymentId: null, kind: 'SIGNUP', ip: '105.27.123.45', ua: 'Mozilla/5.0 iPhone 15 Kenya Safaricom', commissionAmountDecimal: null, createdAt: new Date(Date.now() - 4 * ONE_DAY_MS) },
    ],
  });
  console.log('[prisma/seed] Affiliate created:', affiliate.referralCode);

  // ---------- Demo Employer: ScribePro US Remote (Post a Job works from here) --------------------------------------------
  const employerScribePro = await prisma.employer.create({
    data: {
      id: 'emp-seed-scribepro-0001',
      companyName: 'ScribePro Health USA (Remote)',
      email: 'seed-employer@medremote.ke',
      companyUrl: 'https://scribepro.example.com',
      contactName: 'Sarah Johnson — VP Scribe Ops',
      plan: 'MONTHLY_UNLIMITED_POSTS',
    },
  });
  const employerHvacRemote = await prisma.employer.create({
    data: {
      id: 'emp-seed-hvacdispatch-0002',
      companyName: 'SmartPlant BMS Dispatch Remote (EU)',
      email: 'seed-employer-hvac@medremote.ke',
      companyUrl: 'https://smartplantbms.example.eu',
      contactName: 'Peter Van Der Merwe — EU Facilities Director',
      plan: 'PAY_PER_POST',
    },
  });
  console.log('[prisma/seed] Employers seeded:', employerScribePro.id, employerHvacRemote.id);

  // ---------- 30 Jobs: split 12 Medical Scribe / 6 Billing / 6 Reception / 4 HVAC Intake / 2 Admin ----------------------
  type JobSeed = {
    title: string;
    company: string;
    employerId: string;
    salary: string;
    shift: string;
    qualification: string;
    rawApplyUrl: string;
    category: string;
    description: string;
    requirements: string;
    responsibilities: string;
    location: string;
    matchKeywords: string[];
    skillsRequired: string[];
  };
  const seedJobs: JobSeed[] = [
    // 12 Medical Scribe (ScribePro + mix)
    { title: 'Remote Tier II Medical Scribe — Orthopedic Group (US Night Shift)', company: 'ScribePro Health USA', employerId: employerScribePro.id, salary: '$16/hr', shift: 'US Daytime | Kenya 9pm – 5am EAT', qualification: 'KNCK / TVET Medical + 6-week Scribe onboarding', rawApplyUrl: 'https://scribepro.example.com/apply/ortho-t2-77', category: 'Medical Scribe',
      description: 'Join 1,200+ Kenyan scribes supporting 120 US orthopedic surgeons. Real-time Epic Hyperspace documentation, 70 wpm typing minimum.',
      requirements: '- KNCK KRCHN/KRN diploma minimum, or Clinical Officer 3yr diploma, or KMTC nursing certificate + ScribeAcademy certification. - HIPAA aware. - 60+ wpm typing accuracy 98%. - Stable fiber internet 10mbps. - Noise cancelling headset. - Available US daytime shift (Kenya 9pm-5am, 40 hrs/week).',
      responsibilities: 'Document H&P, SOAP notes, procedure notes, post-op visits, follow-up encounters via Epic in real time. Physician dictation transcription via Dragon. Medication reconciliation. Chart prep. Lab entry.',
      location: 'Remote — Kenya based OK',
      matchKeywords: ['Epic Hyperspace', 'Orthopedic Scribe', 'Medical Scribe Tier II', 'Tele-health Scribe', 'SOAP documentation', 'EpicCare'],
      skillsRequired: ['Medical Scribe', 'Epic EHR', 'SOAP notes', 'HIPAA compliance', 'Medical terminology', 'Dragon NaturallySpeaking', 'Typing 70 WPM'] },
    { title: 'Medical Scribe — Remote US Cardiology Group (Tier I entry)', company: 'CardioScribe Partners USA', employerId: employerScribePro.id, salary: '$12/hr → $14/hr after 90d', shift: 'Kenya 8pm – 4am EAT', qualification: 'Medical certificate level entry, onboarding 4 weeks paid', rawApplyUrl: 'https://cardioscribe.example.com/apply/t1-cardiology-31', category: 'Medical Scribe',
      description: 'Cardiology scribe — dictation capture 15 providers, 25 patients per scribe per day. 90-day probation then raise $12→$14/hr.',
      requirements: 'Any KMTC/TVET/Clinical officer cert, basic anatomy term pass (test given). English written fluent. Kenya English accent clear for dictation capture.',
      responsibilities: 'Dictation capture cardiology H&P, stress test results, echo reports, EKG interpretation narratives, EHR entries.',
      location: 'Remote Kenya OK',
      matchKeywords: ['Cardiology Scribe', 'EHR Documentation', 'Tele Scribe entry', 'Cardiology terminology'],
      skillsRequired: ['Medical Scribe', 'SOAP notes', 'HIPAA compliance', 'Medical Terminology', 'Cardiology'] },
    { title: 'Emergency Department (ED) Remote Scribe — 12-hour night shift, US Level 1 Trauma', company: 'TraumaScribe Co US', employerId: employerScribePro.id, salary: '$18/hr night differential', shift: '12h shifts Kenya 10pm – 10am EAT × 4d/wk', qualification: 'Registered Nurse Kenya or Clinical Officer diploma minimum', rawApplyUrl: 'https://tscribe.example.com/ed-scribe-night-091', category: 'Medical Scribe',
      description: 'Level 1 US Trauma center ED scribe — high paced, 20 encounters/shift, Epic ASAP.',
      requirements: 'Must be currently active KRCHN/KRN KNCK license. 1+ year ED or Triage experience Kenya hospital.',
      responsibilities: 'Triage notes, H&P, Rapid provider dictation capture.',
      location: 'Remote Kenya',
      matchKeywords: ['ED Scribe', 'Emergency Department', 'Level 1 Trauma', 'Epic ASAP'],
      skillsRequired: ['Triage', 'Emergency Department Scribe', 'Epic', 'HIPAA', 'SOAP notes'] },
    { title: 'Tele-Triage RN Level 2 Remote (US Telehealth — Kenya night)', company: 'TeleNurse Global Inc', employerId: employerScribePro.id, salary: '$22/hr', shift: 'Kenya 9pm-5am × 5 days', qualification: 'KRCN RN Kenya BScN or Diploma RN + NCLEX bridge enrollee OK', rawApplyUrl: 'https://telenurseglobal.example.com/apply/l2-rn-221', category: 'Medical Scribe',
      description: 'Remote US Telehealth triage — 80% phone + 20% video. Use US EHR to document 30+ daily encounters. Nursing protocols per Schmitt-Thompson.',
      requirements: 'Full KRN/RN active license Kenya. 1+ year triage. Schmitt-Thompson certification within 30 days of hire (paid).',
      responsibilities: 'Tele-triage phone/video, EHR charting, patient follow-up scheduling.',
      location: 'Remote Kenya OK',
      matchKeywords: ['Tele-Triage RN', 'Remote RN Kenya', 'Schmitt-Thompson', 'Telehealth documentation'],
      skillsRequired: ['Tele-triage', 'Registered Nurse (RN)', 'HIPAA', 'SOAP', 'Charting'] },
    ...(Array.from({ length: 8 }).map((_, i) => ({
      title: ['Family Practice Remote Scribe Tier I', 'Pediatrics Scribe Night Shift', 'Dermatology Scribe — US South Clinic', 'Neurology Scribe — Headache Center', 'Urgent Care Scribe — 8hr rolling shifts', 'Gastroenterology (GI) Procedure Scribe', 'Ophthalmology Remote Scribe', 'Internal Medicine Hospitalist Scribe'][i]!,
      company: ['ScribePro Health USA', 'TeleScribe International', 'MedScribe Partners', 'ScribeWell', 'ProScribe US', 'Aureus Medical Remote', 'Robin Healthcare Remote', 'Augmedix AI-assisted'][i]!,
      employerId: i % 2 === 0 ? employerScribePro.id : '',
      salary: ['$13/hr', '$14/hr', '$15/hr', '$12.50/hr', '$13.50/hr', '$15.50/hr', '$16/hr', '$17/hr'][i]!,
      shift: ['Kenya 9pm-5am', 'Kenya 8pm-4am', 'Kenya 10pm-6am', 'Flex 6hr shifts min 25/week', 'Kenya 7pm-3am', 'Night shift 12h × 3', 'US East Day Kenya 4pm-12am', 'Kenya 9pm-5am'][i]!,
      qualification: ['KNCK Nursing Certificate + 4 weeks scribing onboarding paid', 'TVET Medical + ScribeAcademy Certification', 'Diploma Community Health (Clinical Officer)', 'Medical Secretary Certificate + Typing 70wpm', 'KMTC Nursing + Typing 60wpm', 'Any Medical Diploma / Certificate', 'Health Records IT Diploma (RHIT Equivalent)', 'BSc Clinical Medicine/Registered Nurse'][i]!,
      rawApplyUrl: `https://example-medscribe.example.com/jobs/tier1-${i + 10}-${Math.random().toString(36).slice(2, 8)}`,
      category: 'Medical Scribe',
      description: `Entry to mid-level medical scribe role, ${['Family Practice', 'Pediatric', 'Dermatology', 'Neurology', 'Urgent Care', 'GI', 'Ophth', 'IM Hospitalist'][i]} group. Real-time documentation. ${i % 2 ? 'Epic EHR' : 'athenaClinicals EHR'}. Stable fiber internet required. 13th month bonus after 12mo.`,
      requirements: 'Kenya medical certificate/diploma minimum. Typing 60wpm+. English fluent. HIPAA aware. Noise cancelling headset + quiet office.',
      responsibilities: 'SOAP documentation, H&P, dictation capture, medication reconciliation, chart prep.',
      location: 'Remote — Kenya',
      matchKeywords: [`${['Family Practice','Pediatric','Dermatology','Neurology','Urgent Care','GI Procedure','Ophthalmology','Internal Medicine Hospitalist'][i]} Scribe`, i % 2 ? 'Epic EHR' : 'athenahealth EHR', 'Tele Scribe Kenya', 'Medical Scribe Certification'],
      skillsRequired: ['Medical Scribe', i % 2 ? 'Epic' : 'athenahealth', 'SOAP notes', 'HIPAA', 'Medical terminology', 'Typing 60 WPM+'],
    }))) as unknown as JobSeed[],
    // 6 Billing & Coding
    ...((['CPC Certified Remote Medical Coder — Outpatient Facility', 'Remote Denial Appeals Specialist — Hospital RCM', 'Charge Entry Posting Agent (US 837P)', 'Risk Adjustment HCC Coder (Medicare Advantage)', 'ERA 835 Payment Posting & Reconciliation', 'Prior Authorization Specialist — Oncology Drugs'] as const).map((title, i) => ({
      title,
      company: ['Waystar Health', 'Optum360 Kenya SSC', 'RCM Kenyan BPO', 'HCSC Risk Adjustment', 'GeBBS Healthcare', 'Parallon Workforce Solutions'][i]!,
      employerId: i % 2 === 0 ? employerScribePro.id : '',
      salary: ['$1,400/month', '$1,500/month', '$1,100/month', '$1,800/month', '$1,300/month', '$1,700/month'][i]!,
      shift: ['Kenya 4pm-12am', 'US East Kenya 5pm-1am', 'Night Kenya 9pm-5am', 'Kenya 3pm-11pm', 'Kenya 9am-5pm local', 'Kenya 10pm-6am'][i]!,
      qualification: ['CPC-A or CPC certified + 1 yr exp', 'Denial management 2+ yrs, CO-45 CO-50 appeal', 'Charge entry exp 1 yr, medical diploma', 'HCC CPC Coder, CRC credential or path', 'ERA 835 posting + Excel VLOOKUP', 'PA oncology submission via Covermymeds'][i]!,
      rawApplyUrl: `https://billingjobs.example.com/apply/cpc-${i}-${Math.random().toString(36).slice(2,8)}`,
      category: 'Medical Billing & Coding',
      description: `Billing & coding — ${title}. Claims submission 837P/I, ERA 835, denial appeal writing, HIPAA compliant. Remote Kenya. Monthly KPIs 95% clean claim rate.`,
      requirements: 'CPC/CCS/CRC certification or enrolled. Medical terminology strong. KPIs tracked. Excel Pivot + VLOOKUP.',
      responsibilities: 'ICD-10-CM / CPT abstracting, charge posting, claim submission, denial appeal, ERA reconciliation.',
      location: 'Remote Kenya',
      matchKeywords: [title.split(' ').slice(0, 3).join(' '), 'ICD-10-CM', 'CPT Coding', 'HIPAA', '837P', '835 ERA'],
      skillsRequired: ['ICD-10-CM', 'CPT', 'Medical Billing', 'CPC Certified', 'Denial Appeals', 'HIPAA', 'Excel'],
    })) as unknown as JobSeed[]),
    // 6 Medical Reception
    ...((['Medical Receptionist — US Family Practice Remote (Front Desk)', 'Eligibility Verification Agent — Dental DSO Remote', 'Prior Auth Collect & Submission — Dermatology', 'Medical Appointment Scheduler — Epic Cadence', 'New Patient Intake Coordinator — Mental Health Group', 'Patient ROI (Records Release) — Optum Remote Kenyan SSC'] as const).map((title, i) => ({
      title,
      company: ['FamilyMed Remote Practice', 'SmileDental USA DSO', 'DermCollect PA Team', 'Mercy Health US', 'Mindful Therapy Group US', 'Optum Global Ops Kenya'][i]!,
      employerId: i % 3 === 0 ? employerScribePro.id : '',
      salary: ['$9/hr', '$10/hr', '$9.50/hr', '$11/hr', '$8.75/hr', '$12/hr'][i]!,
      shift: ['Kenya 4pm-12am', 'Kenya 5pm-1am', 'Kenya 8pm-4am', 'Kenya 9pm-5am', 'Kenya 6pm-2am', 'Kenya 9am-5pm local'][i]!,
      qualification: ['Medical Reception Certificate TVET', 'Dental Reception + Dental code knowledge', 'PA exp, Covermymeds or Athena', 'Epic Cadence scheduling exp + Medical diploma', 'Mental Health intake + Excel', 'HIPAA ROI form 45 CFR 164.508 knowledge'][i]!,
      rawApplyUrl: `https://med-reception.example.com/rx/j-${i}-${Math.random().toString(36).slice(2,8)}`,
      category: 'Medical Reception',
      description: `${title}. Greet patients remotely via phone/video, verify insurance 270/271, schedule appointments, collect copays via card/portal.`,
      requirements: 'HIPAA, patient empathy, multi-line phone, strong English accent neutral. EHR navigation.',
      responsibilities: 'Check-in, eligibility verification, scheduling, copay collection, message routing.',
      location: 'Remote Kenya',
      matchKeywords: [title.split(' ')[0], 'Medical Reception', 'HIPAA', '270/271 Eligibility', 'Patient Scheduling'],
      skillsRequired: ['Medical Reception', 'HIPAA', 'Eligibility Verification', 'Appointment Scheduling', 'Phone Etiquette'],
    })) as unknown as JobSeed[]),
    // 4 HVAC / BMS Intake Remote dispatch & 2 admin
    {
      title: 'HVAC BMS Night Shift Dispatch (Remote Kenya, EU Night Intake)',
      company: 'SmartPlant BMS Dispatch Remote (EU)',
      employerId: employerHvacRemote.id,
      salary: 'KES 95,000/month + KES 15K night shift allowance',
      shift: 'EU Night → Kenya 10pm – 6am × 5 days',
      qualification: 'TVET HVAC Diploma Level 5+ or Building Services / Chiller Operations. BACnet/Modbus knowledge required.',
      rawApplyUrl: 'https://smartplantbms.example.eu/dispatch/apply/bms-night-kenya-44',
      category: 'HVAC Intake',
      description: 'Remote 24x7 EU BMS dispatch intake: triage client HVAC alarms via Niagara 4 / Desigo CC SMS & email, log work orders, dispatch field technicians 150 contractors London, Paris, Berlin. 140+ alarms/shift.',
      requirements: 'TVET HVAC Diploma level 5. BMS (Niagara 4, Desigo, Metasys) — at minimum 1 year. BACnet IP troubleshooting. English + French basic a +. Shift work non-negotiable.',
      responsibilities: 'Monitor alarm queues Niagara 4. Triage severity. Log work orders Maximo. Call out technicians via roster. BMS trending follow-up.',
      location: 'Remote Kenya OK (fiber 20Mbps minimum)',
      matchKeywords: ['BMS Dispatch', 'Niagara 4 Workbench', 'BACnet', 'HVAC Night Shift Intake', 'Chiller Alarm Triage', 'Siemens Desigo CC', 'Johnson Controls Metasys'],
      skillsRequired: ['HVAC', 'BMS (Building Management System)', 'BACnet', 'Niagara 4', 'Chiller Plant Operations', 'Maximo CMMS', 'Alarm Triage', 'Work Order Dispatch'],
    },
    {
      title: 'HVAC Chiller Operations Remote Support Technician (US Night)',
      company: 'United-Cooling Remote Ops Dallas TX',
      employerId: '',
      salary: '$1,200/month',
      shift: 'US Day → Kenya 8pm-4am EAT',
      qualification: 'TVET Chiller Plant Operations Level 5, EPA 608 Type II equivalency — R22/R134a/R410a',
      rawApplyUrl: 'https://unitedcooling.example.com/ops/apply/chiller-remote-kenya-22',
      category: 'HVAC Intake',
      description: '24×7 remote monitoring 120 centrifugal + screw chillers (York/Carrier/Trane) at 48 US data centers. Triage alarms, trend-chase, walk field techs via Zoom for repairs.',
      requirements: 'Chiller operations experience minimum 3 years plant room Kenya. EPA 608 optional but paid for.',
      responsibilities: 'Chiller daily logs, alarm triage, work instructions for field, weekly optimization report.',
      location: 'Remote Kenya',
      matchKeywords: ['Centrifugal Chiller York', 'Chiller Plant Ops', 'HVAC Remote Monitoring', 'Data Center Cooling'],
      skillsRequired: ['HVAC Chiller Operations', 'York', 'Carrier', 'Trane', 'Centrifugal Compressors', 'Cooling Tower'],
    },
    {
      title: 'HVAC Controls Service Desk Remote — BAS BACnet / Johnson Controls',
      company: 'ControlsDesk Inc. Remote LATAM/Kenya',
      employerId: '',
      salary: '$1,000/month + annual bonus',
      shift: 'Kenya 3pm-11pm (US East Morning)',
      qualification: 'Controls Technician Level 4/5 — BACnet MS/TP, VFD tuning, Niagara points',
      rawApplyUrl: 'https://controls-desk.example.com/apply/bas-l2-07',
      category: 'HVAC Intake',
      description: 'Tier 1 Controls service desk: answer 60 phone+ticket daily HVAC BAS issues, remote access clients, troubleshoot offline controllers, escalate L3.',
      requirements: 'HVAC Controls field experience. VFD parameter tuning experience.',
      responsibilities: 'Service ticket dispatch via ServiceChannel, L1 troubleshooting, follow up.',
      location: 'Remote Kenya',
      matchKeywords: ['HVAC Controls ServiceDesk', 'BACnet MS/TP', 'Johnson Controls Metasys'],
      skillsRequired: ['HVAC Controls', 'BACnet', 'Metasys', 'Service Desk', 'VFD Danfoss/ABB'],
    },
    {
      title: 'HVAC Preventive Maintenance Work Order Processor — CMMS Remote',
      company: 'FacilityForce USA',
      employerId: '',
      salary: '$900/month',
      shift: 'Kenya 9am-5pm local (US overnight reports)',
      qualification: 'HVAC PM experience (screw/chiller/air handlers) + CMMS Excel Advanced',
      rawApplyUrl: 'https://facilityforce.example.com/apply/pm-kenya-88',
      category: 'HVAC Intake',
      description: 'Process 120+ weekly HVAC PM work orders. Pull MAXIMO reports, schedule vendors, QA inspection PDFs submitted.',
      requirements: 'HVAC PM knowledge, Excel VLOOKUP/Pivot, CMMS.',
      responsibilities: 'Work order processing, scheduling, document QA.',
      location: 'Remote Kenya',
      matchKeywords: ['HVAC PM Work Order', 'Maximo CMMS', 'HVAC Maintenance'],
      skillsRequired: ['HVAC Preventive Maintenance', 'Maximo', 'Excel Advanced', 'Document QA'],
    },
    // 2 Admin
    {
      title: 'Remote Executive Virtual Assistant — US Founder Healthcare SaaS',
      company: 'USHealthTech SaaS',
      employerId: employerScribePro.id,
      salary: '$1,600/month',
      shift: 'US East 9am-5pm → Kenya 4pm-12am EAT',
      qualification: 'Admin Diploma + Executive VA 2+ years. Notion + QuickBooks Online.',
      rawApplyUrl: 'https://healthtech-va.example.com/apply/founder-va-761',
      category: 'Administration',
      description: '1:1 EA for US Healthcare SaaS founder. Calendar, travel, fundraising deck cleanup, hiring coordination, investor follow-up.',
      requirements: 'Executive VA 2+ years. English written elite. Proactive follow-up. Calendly/Notion/ClickUp.',
      responsibilities: 'Calendar 30+ meetings/wk, travel, investor CRM follow up, hiring ATS coordination Greenhouse.',
      location: 'Remote Kenya',
      matchKeywords: ['Executive VA', 'Notion Expert', 'Healthcare SaaS', 'Founder Support', 'Investor CRM'],
      skillsRequired: ['Executive Assistant', 'Calendar Management', 'Notion', 'QuickBooks', 'English Writing Elite'],
    },
    {
      title: 'Customer Support Agent — Health Insurance (Kenya Swahili-English Bilingual)',
      company: 'Pula Insurance Advisory Tech',
      employerId: '',
      salary: 'KES 68,000/month',
      shift: 'Kenya Rotational 8hr',
      qualification: 'Certificate Customer Care + Medical Insurance NHIF knowledge. Swahili/English fluent.',
      rawApplyUrl: 'https://pula.example.com/apply/support-bilingual-101',
      category: 'Customer Support',
      description: 'Answer 40+ inbound calls daily. Advise Kenyan policyholders on outpatient/inpatient M-Pesa premium payments, NHIF integration, pre-auth.',
      requirements: 'Call center 1+ yr. Medical insurance basic (NHIF, outpatient, inpatient). Bilingual Swahili-English.',
      responsibilities: 'Inbound calls, case logging Zendesk, refund (M-Pesa Reversal) coordination via Daraja.',
      location: 'Remote Kenya',
      matchKeywords: ['Customer Support Health Insurance', 'M-Pesa Reversals', 'Swahili Bilingual', 'Zendesk'],
      skillsRequired: ['Customer Support', 'M-Pesa Operations', 'Swahili-English Interpreter', 'Zendesk', 'NHIF'],
    },
  ].flat();

  // Write 30 jobs
  const createdJobs = [] as Awaited<ReturnType<typeof prisma.job.create>>[];
  for (const seed of seedJobs) {
    createdJobs.push(await prisma.job.create({
      data: {
        id: 'job-seed-' + Math.random().toString(36).slice(2, 10),
        title: seed.title,
        company: seed.company,
        salary: seed.salary,
        shift: seed.shift,
        qualification: seed.qualification,
        rawApplyUrl: seed.rawApplyUrl,
        category: seed.category,
        sourceAgency: 'MEDREMOTE_SEED_V1',
        isActive: true,
        employerId: seed.employerId || null,
        description: seed.description,
        requirements: seed.requirements,
        responsibilities: seed.responsibilities,
        location: seed.location,
        postedAt: new Date(Date.now() - (1 + Math.random() * 20) * ONE_DAY_MS),
        expiresAt: new Date(Date.now() + (30 + Math.random() * 30) * ONE_DAY_MS),
        matchKeywords: seed.matchKeywords,
        skillsRequired: seed.skillsRequired,
      },
    }));
  }
  console.log('[prisma/seed] Jobs created:', createdJobs.length, '| categories:', Object.entries(
    createdJobs.reduce<Record<string, number>>((acc, j) => { acc[j.category] = (acc[j.category] ?? 0) + 1; return acc; }, {})
  ).map(([k, v]) => `${k}:${v}`).join(', '));

  // ---------- ResumeVersion (2 rows: Original Kenyan CV + AI Rewrite v1 ---------------------------------------------------
  const rvOriginal = await prisma.resumeVersion.create({
    data: {
      id: 'rv-seed-original-0001',
      userId: user.id,
      version: 1,
      sourceKind: 'ORIGINAL_KENYAN_CV',
      roleTargetJobId: null,
      rawInputText: user.rawResumeText ?? '',
      llmOutputMarkdown: user.rawResumeText ?? '',
      promptSnapshot: 'User onboarding manual PDF/OCR text dump upload — Kenya CV format raw. NOT LLM generated — ORIGINAL row.',
      modelName: 'none: onboarding-upload',
      tokensUsed: 0,
      atsScoreSnapshot: 62,
    },
  });
  const rvRewritten = await prisma.resumeVersion.create({
    data: {
      id: 'rv-seed-rewritten-0002',
      userId: user.id,
      version: 2,
      sourceKind: 'AI_REWRITE_US_FORMAT',
      roleTargetJobId: null,
      rawInputText: user.rawResumeText ?? '',
      llmOutputMarkdown: user.rewrittenResumeMarkdown ?? '',
      promptSnapshot: `system:You are US ATS resume writer. Convert Kenya KNCK KRCHN to CMA US. user resume length ${(user.rawResumeText?.length ?? 0)} chars. action_verbs=200 injected`,
      modelName: 'gpt-4o-mini',
      tokensUsed: 1280,
      atsScoreSnapshot: user.atsScore ?? 91,
    },
  });
  console.log('[prisma/seed] ResumeVersions:', rvOriginal.version, rvRewritten.version, 'scores', rvOriginal.atsScoreSnapshot, '→', rvRewritten.atsScoreSnapshot);

  // ---------- 6 JobMatch rows — realistic scores 78-96% -----------------------------------------------------------------
  const matchRowsInput: Array<{ jobIdx: number; overallPct: number; reasons: MatchReason[]; present: string[]; missing: string[]; niceToHave?: string[] }> = [
    { jobIdx: 0, overallPct: 96, reasons: ['EXACT_SKILL', 'CERT_EQUIVALENT', 'KEYWORD_HIT'], present: ['SOAP', 'HIPAA', 'Epic Scribe', 'CMA mapped'], missing: ['Epic Hyperspace certified - can add 4wk paid onboarding'], niceToHave: ['Orthopedic terminology'] },
    { jobIdx: 3, overallPct: 94, reasons: ['EXACT_SKILL', 'CERT_EQUIVALENT', 'KENYA_EXPERIENCE_MAPPED'], present: ['Triage', 'HIPAA', 'Tele-triage'], missing: ['Schmitt-Thompson (paid within 30d hire)', 'NCLEX registration (optional pathway to full RN US)'] },
    { jobIdx: 2, overallPct: 91, reasons: ['EXACT_SKILL', 'KEYWORD_HIT', 'LOCATION_OPEN'], present: ['ED Triage', 'RN Diploma Kenya', 'Epic ASAP familiarity'], missing: ['Epic ASAP direct hands-on — 2w self-paced training'] },
    { jobIdx: 1, overallPct: 87, reasons: ['EXACT_SKILL', 'KEYWORD_HIT'], present: ['Medical Terminology', 'Cardiology Triage exposure'], missing: ['Cardiology Scribe training 4 weeks', 'Cardiology CPT codes'] },
    { jobIdx: 4, overallPct: 82, reasons: ['EXACT_SKILL'], present: ['Family Practice', 'SOAP notes'], missing: ['Pediatrics rotation', 'EpicCare'] },
    { jobIdx: 12 + 0, overallPct: 78, reasons: ['KEYWORD_HIT'], present: ['HIPAA', 'Excel'], missing: ['CPC Certification', 'ICD-10-CM code book 2026 1 year'] },
  ];
  const createdMatches = [];
  for (const m of matchRowsInput) {
    const job = createdJobs[m.jobIdx];
    if (!job) continue;
    createdMatches.push(await prisma.jobMatch.create({
      data: {
        id: 'match-seed-' + Math.random().toString(36).slice(2, 8),
        userId: user.id,
        jobId: job.id,
        overallPct: m.overallPct,
        skillBreakdown: { present: m.present, missing: m.missing, niceToHave: m.niceToHave },
        reasons: m.reasons,
        semanticScore: m.overallPct / 100,
        keywordScore: Math.max(0.3, (m.overallPct - 5) / 100),
        recalcVersion: 1,
        narrative: `${job.category} top ${m.overallPct}% match. KNCK KRCHN → CMA(AAMA) equivalent, 6yr Eldoret OPD triage — maps well to ${job.company} ${job.category} shift profile. Gaps: ${(m.missing as string[]).join(', ')}.`,
        createdAt: new Date(Date.now() - 2 * ONE_DAY_MS),
        expiresAt: new Date(Date.now() + 30 * ONE_DAY_MS),
      },
    }));
  }
  console.log('[prisma/seed] Matches created (6):', createdMatches.map(x => `#${x.overallPct}% ${createdJobs.find(j => j.id === x.jobId)?.title?.slice(0, 30)}`).join(', '));

  // ---------- 2 Applications: 1 Submitted (CardioScribe) + 1 QUEUED preview TeleTriage -------------------------------
  const jobSubmitted = createdJobs[1]!;
  const jobQueued = createdJobs[3]!;

  const appSubmitted = await prisma.application.create({
    data: {
      id: 'app-seed-submitted-0001',
      userId: user.id,
      jobId: jobSubmitted.id,
      stage: ApplyStage.SUBMITTED,
      approvedAt: new Date(Date.now() - 3 * 60 * 60_000),
      generatedResumeVersionId: rvRewritten.version,
      submissionPayloadSnapshot: {
        'first_name': 'John', 'last_name': 'Kipruto', 'email': 'john@kipruto.ke', 'phone': '+254712345678',
        'country_work_authorized': 'Kenya (Remote)', 'work_eligibility': 'Remote, no US visa needed',
        'certifications': 'CPC Medical Scribe — ScribeAcademy, KNCK KRCHN Registered #KR-872345',
        'typing_wpm_verified': '78 WPM',
        'availability_us_daytime': 'Yes Kenya 9pm-5am × 5 days',
        'resume_pdf': 'uploaded://rv-seed-rewritten-0002',
      },
      externalApplyUrl: jobSubmitted.rawApplyUrl,
      externalConfirmationId: 'CARDIO-SCRIBE-APPLICATION#88271-JK',
      aiAudit: {
        coverLetterTokens: 620,
        tailoredResumeTokensUsed: 1100,
        matchPctSnapshot: 87,
        missingSkillsHighlightedInLetter: true,
      },
      createdAt: new Date(Date.now() - 6 * 60 * 60_000),
      submittedAt: new Date(Date.now() - 2 * 60 * 60_000),
    },
  });

  const coverLetterSubmitted = await prisma.coverLetter.create({
    data: {
      id: 'cl-seed-submitted-0001',
      applicationId: appSubmitted.id,
      llmPromptSnapshot: 'Write 3-paragraph cover letter for John Kipruto → CardioScribe Partners T1 role',
      modelName: 'gpt-4o-mini',
      tokensUsed: 620,
      markdownBody:
`# Cover Letter — John Kipruto → CardioScribe Partners USA T1 Cardiology Scribe

Dear Sarah Johnson & CardioScribe Hiring Team,

I am writing to express my strong interest in the **Remote Tier I Cardiology Scribe** role at CardioScribe Partners USA. As a Kenya Registered Community Health Nurse (KRCHN, #KR-872345) with 6 years of OPD triage & 200+ hours of cardiology outpatient exposure at Moi Teaching and Referral Hospital, combined with my recent ScribeAcademy Tier II certification and 91% ATS CMA-equivalent rewritten resume score, I am confident I would immediately be a high-performing scribe on your Cardiology team.

In my current role, I triage 45+ patients per day, documenting SOAP notes, vitals and medication lists in KenyaEMR with 98.5% accuracy over the last two years. I have personally transcribed cardiologist outpatient dictation for 10 weekly hypertension + heart failure follow-up clinics in Eldoret, and I have completed additional self-paced training on cardiology CPT coding (92950, 93000, 93005, 93306) to prepare for US cardiology documentation. I type 78 WPM verified, I am available full-time 9pm-5am EAT (US daytime) for 40 hours/week on fiber 50 Mbps, and I work from a sound-dampened home office with a noise-cancelling headset — 100% set up to go live within the 4-week paid onboarding.

I would welcome the opportunity to discuss my CMA-equivalent KNCK mapping and ScribeAcademy training with you on a 15-minute interview call. I can start training on **Monday next week**.

Thank you for your consideration.
Sincerely,
John Kipruto
+254 712 345 678 · john@kipruto.ke
KRCHN KNCK License #KR-872345 · Active through March 2027
`,
    },
  });

  const appQueued = await prisma.application.create({
    data: {
      id: 'app-seed-queued-preview-0002',
      userId: user.id,
      jobId: jobQueued.id,
      stage: ApplyStage.QUEUED,
      generatedResumeVersionId: undefined,
      submissionPayloadSnapshot: undefined,
      externalApplyUrl: jobQueued.rawApplyUrl,
      failureReason: undefined,
      aiAudit: { note: 'QUEUED — user has NOT yet pressed Confirm & Submit. Preview only.' } as any,
      createdAt: new Date(Date.now() - 30 * 60_000),
    },
  });
  console.log('[prisma/seed] Applications SUBMITTED:', appSubmitted.id, 'QUEUED:', appQueued.id, 'CoverLetter:', coverLetterSubmitted.id);

  // ---------- LlmCallAudit 3 mock rows (2 rewrites + 1 cover letter = 2 rows — add 3 for match recalc) ----------------
  await prisma.llmCallAudit.createMany({
    data: [
      { id: 'llm-a-0001-resume-rewrite', userId: user.id, feature: 'A_RESUME_REWRITE', model: 'gpt-4o-mini', promptTokens: 3500, outputTokens: 1280, totalCostDecimal: 0.00072, durationMs: 3200, success: true, createdAt: new Date(Date.now() - 7 * ONE_DAY_MS) },
      { id: 'llm-a-0002-matching-recalc', userId: user.id, feature: 'B_MATCHING_RECALC', model: 'gpt-4o-mini', promptTokens: 2100, outputTokens: 640, totalCostDecimal: 0.00043, durationMs: 2150, success: true, createdAt: new Date(Date.now() - 2 * ONE_DAY_MS) },
      { id: 'llm-a-0003-coverletter', userId: user.id, feature: 'C_COVER_LETTER_GEN', model: 'gpt-4o-mini', promptTokens: 1800, outputTokens: 620, totalCostDecimal: 0.00036, durationMs: 1840, success: true, createdAt: new Date(Date.now() - 3 * 60 * 60_000) },
    ],
  });
  console.log('[prisma/seed] LlmCallAudit rows written: 3');

  // ---------- Payment: 1 M-Pesa SUCCESS 30d ago for demo user (KES 500) ----------------------------------------------
  const payment = await prisma.payment.create({
    data: {
      id: 'pay-seed-john-success-0001',
      merchantRequestId: '12345-SEED-JOHN-001',
      checkoutRequestId: 'ws_CO_200120261200SEEDJOHN001',
      phoneNumber: '254712345678',
      amount: 500,
      mpesaReceiptNo: 'SEEDMPESA887766',
      status: PaymentStatus.SUCCESS,
      userId: user.id,
      amountKES: 500,
      provider: 'mpesa',
      receiptUrl: null,
      tier: PaymentTier.BASIC,
      subscriptionEndsAt: new Date(Date.now() + 30 * ONE_DAY_MS),
      createdAt: new Date(Date.now() - 30 * ONE_DAY_MS + 2 * 60_000),
    },
  });
  console.log('[prisma/seed] Payment SUCCESS seed M-Pesa:', payment.mpesaReceiptNo, '| KES', payment.amountKES);

  // ---------- Saved Job: save top 96% match job to /dashboard/saved ------------------------------------------------
  const topMatchJob = createdJobs[matchRowsInput[0]!.jobIdx];
  if (topMatchJob) {
    await prisma.savedJob.create({
      data: { id: 'saved-seed-top96pct-0001', userId: user.id, jobId: topMatchJob.id, createdAt: new Date(Date.now() - 2 * ONE_DAY_MS) },
    });
    console.log('[prisma/seed] SavedJob 1 row created (top 96% match):', topMatchJob.title.slice(0, 60));
  }

  // ---------- AtsSource rows: pluggable ingestion sources (add more day by day) ------------
  const atsSources = [
    { atsType: 'greenhouse', token: 'anthropic', name: 'Anthropic' },
    { atsType: 'greenhouse', token: 'cloudflare', name: 'Cloudflare' },
    { atsType: 'lever', token: 'medremote', name: 'MedRemote (Lever demo)' },
  ];
  let atsCount = 0;
  for (const s of atsSources) {
    await prisma.atsSource.upsert({
      where: { atsType_token: { atsType: s.atsType, token: s.token } },
      update: { isActive: true },
      create: s,
    });
    atsCount++;
  }
  console.log('[prisma/seed] AtsSource rows upserted:', atsCount, '— add more board tokens day by day');

  console.log('\n============================================');
  console.log('[prisma/seed] ✅ COMPLETE — idempotent seed finished');
  console.log('  · User John Kipruto:       sign in credentials → john@kipruto.ke  /  password: MedRemote2026!');
  console.log(`  · Jobs:                    ${createdJobs.length}  (target ≥ 30)`);
  console.log(`  · JobMatch rows:           ${createdMatches.length}   (scores ${createdMatches.map(m => m.overallPct + '%').join(' / ')})`);
  console.log(`  · Applications:            2  (SUBMITTED + QUEUED)`);
  console.log(`  · ResumeVersions:          2  (Original Kenyan 62%  →  Rewritten US ATS ${rvRewritten.atsScoreSnapshot}%)`);
  console.log(`  · CoverLetter row:         1  (cardio submitted)`);
  console.log(`  · LlmCallAudit rows:       3  (audit budget tracks every token)`);
  console.log(`  · Affiliate row:           1  (referral code MRJOHN6, BRONZE tier)`);
  console.log(`  · ReferralEvent rows:      2  (CLICK + SIGNUP — ready for T8 PAYMENT commission hook)`);
  console.log(`  · Payment rows:            1  (M-Pesa SEED SUCCESS, KES 500, receipt SEEDMPESA887766)`);
  console.log('============================================\n');
}

main().catch(e => {
  console.error('[prisma/seed] SEED FATAL:', e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
