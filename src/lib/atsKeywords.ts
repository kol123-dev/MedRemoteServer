export interface KeywordBank {
  category: string;
  hardSkills: string[];
  complianceLegal: string[];
  techToolsEhr: string[];
  softSkills: string[];
}

export const ATS_KEYWORDS_BANK: KeywordBank[] = [
  {
    category: 'Medical Scribe',
    hardSkills: [
      'History & Physical (H&P) documentation', 'SOAP notes', 'EPIC EHR', 'Scribing', 'Medical transcription', 'Patient encounter documentation',
      'Dictation capture', 'Procedure notes', 'Discharge summaries', 'Chart prep', 'Patient rounding', 'Vitals documentation',
      'ICD-10-CM code capture', 'CPT code capture', 'Medical terminology', 'Anatomy & Physiology', 'Clinical documentation improvement (CDI)',
      'Progress notes', 'Chief complaint capture', 'Review of Systems (ROS)', 'Physical Exam (PE)', 'Past Medical/Social/Family History (PMH/PSH/FH/SH)',
      'Allergies / Medications Reconciliation', 'Lab results entry', 'Radiology order entry', 'Referral letter drafting', 'Tele-scribe',
      'Orthopedic scribe', 'ED scribe', 'Family practice scribe', 'Internal medicine scribe', 'Cardiology scribe', 'Pediatric scribe',
      'Scribe training program', 'Accuracy 98% dictation', 'Real-time documentation', 'EHR navigation', 'Dragon NaturallySpeaking',
      'Oloneo Scribe', 'Augmedix', 'DeepScribe', 'Robin Healthcare', 'ScribeEMR',
    ],
    complianceLegal: [
      'HIPAA compliance', 'HITECH Act', 'PHI protection', 'Minimum Necessary rule', 'NPP Notice of Privacy Practices',
      'Joint Commission standards', 'CMS documentation guidelines', 'MACRA MIPS', 'HITECH Breach Notification',
      'Patient consent documentation', 'Incident-to billing documentation', 'OSHA blood-borne pathogen',
      'Patient portal messaging compliance', 'Medical record retention', 'AHIMA standards', 'NIST SP 800-66 (Health Cybersecurity)',
    ],
    techToolsEhr: [
      'Epic', 'EpicCare', 'Epic Hyperspace', 'Cerner Millennium', 'Cerner PowerChart', 'athenahealth', 'athenaClinicals',
      'Meditech Expanse', 'Greenway Health Intergy', 'Kareo', 'Practice Fusion', 'Allscripts Professional EHR',
      'NextGen Healthcare', 'ECW eClinicalWorks', 'e-MDs', 'AdvancedMD', 'DrChrono',
      'Office Ally PracticeMate', 'ELATION', 'Aetna EHR', 'Optum One', 'HCA Healthcare systems',
      'Microsoft Teams Virtual Rounding', 'Zoom Clinics', 'Microsoft Word', 'Microsoft Excel',
      'Google Workspace', 'RingCentral Medical', 'Dialpad', 'HIPAA compliant email encryption',
    ],
    softSkills: [
      'Active listening', 'High accuracy', 'Fast typing 70 WPM', 'Ability to handle 20 pts/day', 'Remain calm', 'Professional bedside manner',
      'Confidentiality', 'Cross-team collaboration RN/MO/DO', 'Patient empathy', 'Surgical mask fit', 'Situational awareness',
    ],
  },
  {
    category: 'Medical Billing & Coding',
    hardSkills: [
      'ICD-10-CM coding', 'ICD-10-PCS coding', 'CPT Level I/II coding', 'HCPCS coding', 'CDI review', 'Chart audit',
      'HCC coding', 'Risk Adjustment (CMS-HCC) coding', 'RAF score optimization', 'Medical Necessity review',
      'Encounter form superbill abstracting', 'Charge entry posting', 'Claim submission 837P/837I', 'ERA 835 posting',
      'EDI 837/835/277', 'Clearinghouse management', 'Change Healthcare clearinghouse', 'Waystar clearinghouse',
      'Availity', 'Office Ally clearinghouse', 'Capitated payment', 'Fee for service billing',
      'Secondary/tertiary claims', 'Workers Comp claims', 'No-Fault auto claims', 'Denial management resolution',
      'EOB / ERA denial code interpretation', 'CO-45, CO-50, PR-1 denial appeal', 'Refiling timely filing',
      'AR aging over 90 days work down', 'Credit balances resolution', 'Patient statements mailing',
      'Patient payment plans', 'Good Faith Estimate (GFE) No Surprises Act', 'Prior Auth (PA) submission',
      'SCA authorization submissions', 'Telehealth modifier 95', 'Place of Service (POS) 02 vs 11',
      'Modifier 25, 59, 24, 57, 79, 26, TC proper use', 'CMS 1500 Form', 'UB-04 Facility Form', 'Superbill',
    ],
    complianceLegal: [
      'HIPAA', 'HITECH', 'CMS Billing Compliance Program OIG 7 elements', 'Anti-kickback statute',
      'Stark Law', 'False Claims Act', 'No Surprises Act (GFE)', 'ACA MLR rebates',
      'Medicare Conditions of Participation', 'Medicaid Integrity Program', 'RAC audit defense', 'MAC audit defense',
      'Zpics audit readiness', 'CERT review', 'QMB SLMB dual-eligible billing', 'CLIA billing for labs',
    ],
    techToolsEhr: [
      'AdvancedMD Billing', 'athenaCollector', 'Kareo Billing', 'eClinicalWorks RCM', 'NextGen Medical Billing',
      'DrChrono Billing', 'Waystar Revenue Cycle', 'Experian Health', 'Meditech Billing Module',
      'Epic Resolute PB/HB/PB Professional Billing', 'Cerner RevCycle', 'Cerner Soarian Financials',
      'NetSuite for Medical AR', 'QuickBooks Desktop Health Billing', 'Xero Medical Practice',
      'Zocdoc Billing', 'SimplePractice', 'TheraNest', 'SimpleOT',
    ],
    softSkills: [
      'AR collections', 'Patient empathy billing calls', 'Detail oriented', 'CPC certified', 'CCS certified',
      'CPC-A certified', 'CPMA auditing certification', 'Denial appeal writing strong', 'Excel VLOOKUP/Pivot',
    ],
  },
  {
    category: 'Medical Reception / Virtual Assistant',
    hardSkills: [
      'Patient check-in/check-out', 'Insurance eligibility verification 270/271', 'Demographic entry',
      'Appointment scheduling EHR', 'Prior auth document collection', 'Referral letter management',
      'Telehealth visit onboarding instructions', 'No-show calls / reschedule reminders',
      'Inbound triage script call center level', 'Message routing EHR In Basket',
      'HIPAA patient messaging', 'Patient portal onboarding', 'Refill request routing prescriber',
      'Medical records request ROI tracking + faxing', 'Prior authorization fax / portal submissions',
      'New patient paperwork packet', 'Patient collection of copay/coinsurance/deductible',
      'Cash-pay Superbill issue', 'HIPAA compliant faxing (SRFax, Sfax)',
      'Insurance ID card scanning and indexing', 'Medical necessity letter routing',
      'Referral form CMS 1500 17 box completing',
    ],
    complianceLegal: [
      'HIPAA Privacy Rule', 'Minimum Necessary', 'Authorization for Release of PHI (ROI)',
      'No Surprises Act patient disclosures', 'OSHA COVID-19 screening',
      'ADA telehealth accessible communication',
    ],
    techToolsEhr: [
      'Epic Cadence Scheduling', 'athenaScheduling', 'Kareo Appointments', 'eClinicalWorks Front Desk',
      'Practice Fusion Check-in', 'Zocdoc', 'Doxy.me', 'SimplePractice Telehealth',
      'NextGen Patient Portal', 'Healow Portal', 'Solutionreach', 'Phreesia',
      'DentalCurve', 'Modento', 'RocketReach',
      'Aircall', 'Dialpad', 'RingCentral for Medical', 'HIPAA compliant CRM HubSpot HealthCloud',
      'Salesforce Health Cloud', 'Microsoft Bookings', 'Calendly (HIPAA plan)',
      'Gmail (Google Workspace HIPAA)', 'Microsoft Outlook E3/E5 HIPAA', 'Canva Medical Forms',
    ],
    softSkills: [
      'Professional phone etiquette', 'Multilingual (Swahili-English medical translation)', 'High empathy',
      'Calm under pressure', 'Organized', 'High follow-through', 'Front desk de-escalation',
    ],
  },
  {
    category: 'HVAC / Building Services / Chiller Systems',
    hardSkills: [
      'Split A/C installation', 'VRV / VRF systems', 'Variable refrigerant flow Daikin, Mitsubishi',
      'Chiller operation — water cooled & air cooled', 'Centrifugal chiller York / Carrier / Trane',
      'Screw chiller', 'Scroll chiller', 'Absorption chiller',
      'Chiller water treatment chemical dosing', 'Cooling tower (crossflow / counterflow)',
      'Cooling tower fan drives, fill cleaning, drift eliminators', 'Condenser tube brushing & descaling',
      'HVAC load calculations Manual J', 'Manual S equipment selection',
      'Duct design Manual D, ACCA', 'Duct cleaning / sanitization',
      'R22 vs R410A / R32 / R454B (A2L) refrigerants handling', 'EPA 608 Type I / II / III',
      'EPA 608 Universal', 'Leak detection (ultrasonic, electronic, bubble)',
      'Compressor troubleshooting (scroll, reciprocating, screw, centrifugal)',
      'Thermal expansion valve (TXV) adjustment', 'Electronic expansion valve (EEV) setup',
      'Building Management System (BMS) graphics', 'BACnet MS/TP / BACnet IP',
      'Modbus RTU / Modbus TCP', 'LON', 'Niagara 4 / Tridium Vykon',
      'Johnson Controls Metasys', 'Siemens Desigo / APACS', 'Honeywell CentraLine / WebCTRL',
      'Schneider Electric EcoStruxure', 'Distech Controls EC-BOS',
      'Air Handling Unit (AHU) troubleshooting', 'Fan coil unit (FCU) cleaning',
      'Variable Frequency Drives (VFD) ABB, Danfoss, Schneider commissioning',
      'VFD parameter setup (PID loop)', 'BMS alarming and trends',
      'Plant operations — chiller start-stop sequence',
      'Pump balancing (variable primary / primary secondary chilled water)',
      'Air balancing TAB (Testing Adjusting Balancing NEBB)',
      'Boiler / hot water heating', 'Heat pump systems',
      'Energy management optimization / BAS scheduling',
      'Preventive maintenance PM schedules (monthly, quarterly, annual)',
      'Predictive maintenance trend logs BMS', 'Work order system Maximo / ServiceChannel',
      'Refrigeration walk-in cooler & freezer rack systems',
      'Split refrigeration systems (condensing unit + evaporator)',
    ],
    complianceLegal: [
      'EPA 608 Certification', 'EU F-Gas Regulation', 'UK Part L Building Regulations SAP',
      'ASHRAE Standards (ASHRAE 62.1 Ventilation)', 'ASHRAE 55 Thermal Comfort',
      'ASHRAE 90.1 Energy Efficiency', 'NFPA 70 National Electrical Code',
      'OSHA Lockout Tagout LOTO', 'OSHA Confined Space Permit (chiller rooms)',
      'Kenya Energy Act 2019 (Energy & Petroleum Regulatory Authority — EPRA)',
      'ISO 50001 Energy Management', 'ISO 14001 Environmental', 'BS EN 378 Refrigerant safety',
    ],
    techToolsEhr: [
      'Tridium Niagara 4 Workbench', 'Siemens TIA Portal / Desigo CC',
      'Johnson Controls Metasys ADS/ADX', 'Honeywell WEBs N4',
      'FieldServer / SMC Gateways (BACnet to Modbus)', 'Modern Solutions MSA FieldServer',
      'Dranetz PowerVisa Power Analyser', 'Testo 550/557 Digital Manifold Gauge',
      'Fieldpiece Refrigerant Scales', 'UEi Combustion Analyzer',
      'Fluke Clamp Meter 376 FC', 'FLIR Thermal Imager (E4/E6/E8)',
      'VFD programming panels', 'ServiceChannel FM Platform',
      'IBM Maximo EAM', 'UpKeep CMMS', 'Limble CMMS',
      'Procore Facilities', 'SketchUp HVAC drawing', 'AutoCAD MEP', 'Revit MEP',
      'Microsoft Excel trending', 'Power BI BMS dashboard reporting',
    ],
    softSkills: [
      'Plant operations 24x7 on call', 'Troubleshooting under pressure',
      'Client communication technical to plain language', 'Swahili-English site translation skills',
      'Maintenance planning', 'Rigging safety', 'Work at height safety',
    ],
  },
  {
    category: 'Customer Support / Call Center / Insurance',
    hardSkills: [
      'Ticketing system Zendesk', 'Zendesk Guide knowledge base',
      'Freshdesk', 'Freshworks Omnichannel', 'Intercom', 'Help Scout',
      'Salesforce Service Cloud', 'Dynamics 365 Customer Service',
      'First Call Resolution (FCR) 80%+', 'CSAT/NPS/CES tracking',
      'Average Handle Time (AHT) optimization',
      'Insurance first notice of loss (FNOL)',
      'M-Pesa customer support STK resends',
      'KYC / CDD verification procedures Kenya',
      'CRB Credit Reference Bureau Kenya queries',
      'Safaricom line replacement SIM SWAP support scripts',
      'Email writing professional English', 'Live Chat response < 30s',
      'Social Media X/Facebook/Instagram DM support',
      'Refund processing (M-Pesa reversals, Paystack refund API)',
      'SLA adherence 95%', 'Call recording QA audits',
      'Bilingual (Swahili-English- Somali optional)', 'Escalation matrix usage',
    ],
    complianceLegal: [
      'GDPR EU residents data', 'Kenya Data Protection Act 2019 (DPA)',
      'CCPA CPRA California residents', 'PCI DSS (no card PANs stored)',
      'Consumer Protection Act Kenya', 'CBK M-Pesa regulations',
    ],
    techToolsEhr: [
      'Zendesk', 'Freshdesk', 'Intercom', 'Salesforce Service Cloud',
      'Aircall', 'Talkdesk', 'Genesys Cloud CX',
      'Five9', 'JustCall', 'RingCentral Contact Center',
      'Slack support internal', 'Teams helpdesk',
      'Notion internal KB', 'Confluence KB',
      'Paystack API refunds', 'M-Pesa Reversal API (Daraja timeout)',
      'Stripe refunds',
    ],
    softSkills: [
      'Calm de-escalation', 'Active listening', 'High typing speed 60 WPM',
      'Empathetic yet firm refund policy enforcement',
    ],
  },
  {
    category: 'Administration / Operations / Executive VA',
    hardSkills: [
      'Executive calendar management (Google Calendar / Outlook 365)',
      'Travel booking (flights, visa Kenyan passport to US/UK Schengen)',
      'Meeting minutes formal board',
      'Notion / ClickUp / Monday / Asana / Trello project management',
      'CRM data entry Salesforce / HubSpot',
      'Google Sheets / Microsoft Excel advanced (VLOOKUP/XLOOKUP/Pivot)',
      'QuickBooks Online / Xero bookkeeping basics',
      'Netsuite data entry', 'Slides / PPT executive decks',
      'Email management inbox zero triage',
      'Executive briefings daily',
      'Hiring coordination — LinkedIn Recruiter filter & interview scheduling',
      'Onboarding plan creation new hires Kenya',
      'Procurement PO & vendor management Kenya suppliers',
      'M-Pesa bulk payout processing (bulk disbursement via B2C Daraja)',
      'Expense reports (SAP Concur, Expensify, Payhawk)',
      'Event planning virtual & hybrid Nairobi / London',
    ],
    complianceLegal: [
      'Kenya Employment Act 2007 (contracts, leave, NHIF/NSSF)',
      'Data Protection Act Kenya', 'ISO 27001 basics',
      'SLA and contract templates basics review',
    ],
    techToolsEhr: [
      'Asana', 'Notion', 'ClickUp', 'Monday', 'Trello',
      'Slack', 'Microsoft Teams',
      'Google Workspace Admin', 'Microsoft 365 Admin Center',
      'HubSpot CRM', 'Salesforce Lightning',
      'QuickBooks Online', 'Xero', 'FreshBooks',
      'Calendly', 'Cal.com', 'Loom video',
      'Canva Pro', 'Canva Team Brand Kit',
      'DocuSign Kenya', 'Adobe Sign', 'HelloSign',
      'Payhawk Expense Cards Kenya', 'Expensify',
      'Deel Global Payroll', 'Remote (Deel competitor)', 'Pilot payroll',
      'Toggl Track time tracking', 'Harvest time tracking',
    ],
    softSkills: [
      'Proactive follow-up', 'High level of discretion',
      'Executive presence written & verbal', 'Calm under tight deadlines',
      'Kenyan culture norms vs US workplace bridge',
    ],
  },
];

export const allCategories = ATS_KEYWORDS_BANK.map(k => k.category);

const CATEGORY_ALIASES: ReadonlyArray<[RegExp, number]> = [
  // Wildly varying categories come out of the ATS adapters. Normalize them to
  // the closest bank index instead of blindly falling back to index 0.
  [/scribe|clinical|physician|doctor|nursing|dental|healthcare ass|anesthesia|emergency/i, 0], // Medical Scribe
  [/billing|coding|revenu|rcm|claim|denial|reimbursement|medical coder|bill/i, 1], // Medical Billing & Coding
  [/virtual assistant|medical assistant|reception|front desk|schedul|patient coord/iu, 2], // Medical Reception / VA
  [/hvac|chiller|building service|building engineer|maintenance|facilities|bms|refrigeration/i, 3], // HVAC
  [/support|customer|customer service|call center|insurance|helpdesk|success|contact center/i, 4], // Customer Support
  [/administrat|operations|executive|office manager|secretary|coordinator|assistant.*admin|general/i, 5], // Administration
];

/**
 * Resolve the closest keyword bank for a job, favoring an explicit category
 * match first, then broad alias/regex normalization, then any skill phrases
 * actually present in `text` (description/title/requirements). Defaults to
 * index 0 only as a last resort.
 */
export function resolveKeywordBank(category?: string, text?: string): KeywordBank {
  if (category) {
    const c = category.trim().toLowerCase();

    const exact = ATS_KEYWORDS_BANK.find((k) => k.category.toLowerCase() === c);
    if (exact) return exact;

    const bankContains = ATS_KEYWORDS_BANK.find((k) =>
      k.category.toLowerCase().includes(c),
    );
    if (bankContains) return bankContains;

    const reverseContains = ATS_KEYWORDS_BANK.find((k) =>
      c.includes(k.category.toLowerCase()),
    );
    if (reverseContains) return reverseContains;

    for (const [re, idx] of CATEGORY_ALIASES) {
      if (re.test(c)) return ATS_KEYWORDS_BANK[idx]!;
    }
  }

  // Text-based disambiguation: pick whichever bank has the most phrase hits in
  // the given free text (title/description/requirements).
  if (text) {
    const lowerText = text.toLowerCase();
    let bestHits = 0;
    let best: KeywordBank = ATS_KEYWORDS_BANK[0]!;
    for (const bank of ATS_KEYWORDS_BANK) {
      const pool = [
        ...bank.hardSkills,
        ...bank.complianceLegal,
        ...bank.techToolsEhr,
        ...bank.softSkills,
      ];
      let hits = 0;
      for (const kw of pool) {
        if (lowerText.includes(kw.toLowerCase())) hits++;
      }
      if (hits > bestHits) {
        bestHits = hits;
        best = bank;
      }
    }
    if (bestHits > 0) return best;
  }

  return ATS_KEYWORDS_BANK[0]!;
}

export function getKeywordBank(category: string | undefined): KeywordBank | undefined {
  return resolveKeywordBank(category);
}

export function totalKeywordsPerCategoryReport(): Record<string, { hard: number; compliance: number; tools: number; soft: number; total: number }> {
  return Object.fromEntries(
    ATS_KEYWORDS_BANK.map(k => [k.category, {
      hard: k.hardSkills.length,
      compliance: k.complianceLegal.length,
      tools: k.techToolsEhr.length,
      soft: k.softSkills.length,
      total: k.hardSkills.length + k.complianceLegal.length + k.techToolsEhr.length + k.softSkills.length,
    }])
  );
}
