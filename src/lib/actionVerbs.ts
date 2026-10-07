export const ActionVerbsByBucket = {
  LEADERSHIP: [
    'Led', 'Directed', 'Coached', 'Mentored', 'Supervised', 'Orchestrated', 'Championed', 'Spearheaded', 'Pioneered', 'Owned',
    'Drove', 'Managed', 'Steered', 'Guided', 'Mobilized', 'Unified', 'Facilitated', 'Hosted', 'Ran', 'Chaired',
    'Administered', 'Assigned', 'Delegated', 'Empowered', 'Enabled', 'Recruited', 'Onboarded', 'Developed', 'Cultivated', 'Trained',
    'Upskilled', 'Built (teams)', 'Established', 'Founded', 'Instituted', 'Launched', 'Rolled out', 'Scaled', 'Prioritized', 'Planned',
    'Aligned', 'Coordinated', 'Scheduled', 'Organized', 'Structured',
  ],
  CLINICAL_MEDICAL: [
    'Triaged', 'Assessed', 'Documented', 'Monitored', 'Evaluated', 'Treated', 'Administered (medication)', 'Administered (treatment)',
    'Discharged', 'Observed', 'Recorded', 'Charted', 'Performed', 'Conducted', 'Examined', 'Diagnosed (support)', 'Managed (symptoms)',
    'Counselled', 'Educated (patient)', 'Advised', 'Followed up', 'Collected (specimens)', 'Processed (labs)', 'Reviewed (charts)',
    'Reconciled (medications)', 'Coordinated with provider', 'Escalated', 'Rounded', 'Verified', 'Informed',
    'Screened', 'Vaccinated', 'Assisted (surgical / delivery)', 'Scheduled (appointments)', 'Prepped (patient / room)', 'Cleaned',
    'Sterilized', 'Stocked', 'Audited (charts)',
  ],
  TECHNICAL_HVAC_BMS: [
    'Installed', 'Commissioned', 'Troubleshooted', 'Repaired', 'Serviced', 'Maintained', 'Calibrated', 'Tested', 'Balanced (airflow)',
    'Diagnosed (faults)', 'Replaced (components)', 'Inspected', 'Designed (layout)', 'Fabricated (ductwork)', 'Connected (controls)',
    'Wired (controls)', 'Programmed (BMS schedules)', 'Configured (BACnet / Modbus)', 'Monitored (plant)', 'Logged (trends)',
    'Reported (plant status)', 'Quote-prepared', 'Estimated', 'Procured', 'Managed (stock)', 'Dispatched (jobs)', 'Assigned (work orders)',
    'Closed out (work orders)', 'Signed-off', 'Commissioned', 'Compliance-tested', 'Upgraded (controls)', 'Retrofitted', 'Optimized (energy)',
  ],
  TECHNICAL_SOFTWARE_IT: [
    'Automated', 'Built', 'Implemented', 'Deployed', 'Integrated', 'Migrated', 'Refactored', 'Optimized', 'Benchmarked', 'Documented',
    'Resolved', 'Scripted', 'Configured', 'Administered', 'Customized', 'Version-controlled', 'Debugged', 'Released', 'Validated', 'Audited',
  ],
  BILLING_CODING_REVENUE: [
    'Coded (CPT)', 'Coded (ICD-10)', 'Posted (charges)', 'Submitted (claims)', 'Appealed (denials)', 'Followed-up (AR)', 'Posted (payments)',
    'Reconciled (ERA)', 'Reviewed (explanation of benefits)', 'Resolved (edits)', 'Clean-claimed', 'Audited (charts for HCC)',
    'Abstracted (quality measures)', 'Billed', 'Collected', 'Negotiated', 'Reduced (AR days)', 'Improved (clean claim rate)',
  ],
  COMMUNICATION_PATIENT: [
    'Communicated', 'Notified', 'Explained', 'Clarified', 'Listened', 'Responded', 'Addressed', 'Resolved (complaints)',
    'Wrote', 'Drafted', 'Emailed', 'Called', 'Texted', 'Welcomed', 'Reassured', 'Escorted', 'Interviewed', 'Registered',
    'Confirmed (appointments)', 'Reminded (appointments)', 'Followed (up)', 'Verified (insurance)', 'Pre-authorized',
  ],
  ANALYTICS_IMPACT: [
    'Achieved', 'Attained', 'Increased', 'Reduced', 'Lowered', 'Decreased', 'Improved', 'Optimized', 'Saved (time)', 'Saved (money)',
    'Cut (costs)', 'Delivered', 'Grew', 'Scaled (volume)', 'Hit (targets)', 'Exceeded (KPIs)', 'Ranked', 'Averaged', 'Scored',
    'Complied (99.9%)', 'Met (deadlines)', 'Completed (audits)', 'Passed (surveys)', 'Won (contracts)',
  ],
} as const;

type VerbBucket = keyof typeof ActionVerbsByBucket;

const ALL: string[] = [];
for (const bucket of Object.keys(ActionVerbsByBucket) as VerbBucket[]) {
  for (const v of ActionVerbsByBucket[bucket]) {
    if (!ALL.includes(v)) ALL.push(v);
  }
}
export const ACTION_VERBS_ALL = Object.freeze(ALL);

export function pickVerbsForRole(role: string): string[] {
  const r = role.toLowerCase();
  const match: VerbBucket[] = [];
  if (/(hvac|plant|bms|chiller|refriger|air ?con|controls)/.test(r)) match.push('TECHNICAL_HVAC_BMS');
  if (/(nurse|nursing|scribe|clinical|medical|patient|doctor|cma|cna|rn|lpn|scr)/.test(r)) match.push('CLINICAL_MEDICAL');
  if (/(code|billing|revenue|ar|claim|cpc|icd|cmb|remit|denial|hcc)/.test(r)) match.push('BILLING_CODING_REVENUE');
  if (/(support|reception|front ?desk|call|customer|patient service|psr)/.test(r)) match.push('COMMUNICATION_PATIENT');
  if (/(manager|lead|head|supervisor|director|owner|execut)/.test(r)) match.push('LEADERSHIP', 'ANALYTICS_IMPACT');
  if (/(it|software|code|devops|automation|integra|engineer|tech)/.test(r)) match.push('TECHNICAL_SOFTWARE_IT');
  if (match.length === 0) match.push('COMMUNICATION_PATIENT', 'ANALYTICS_IMPACT');
  const out: string[] = [];
  for (const b of match) {
    for (const v of ActionVerbsByBucket[b]) if (!out.includes(v)) out.push(v);
  }
  return out;
}

export const ACTION_VERBS_COUNT = ACTION_VERBS_ALL.length;
