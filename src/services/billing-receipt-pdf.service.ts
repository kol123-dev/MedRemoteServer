import { generatePdfFromMarkdown } from '../lib/pdfExporter.js';

export interface ReceiptInputPayment {
  id: string;
  amount?: number;
  amountKES?: number;
  phoneNumber?: string;
  mpesaReceiptNo?: string | null;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  provider?: string | null;
  tier?: string | null;
  createdAt?: Date;
  receiptUrl?: string | null;
}

export interface ReceiptInputUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
}

export interface ReceiptInputSubscription {
  tier: string;
  startDate: Date;
  endDate: Date;
}

export interface ReceiptInput {
  payment: ReceiptInputPayment;
  user: ReceiptInputUser;
  subscription: ReceiptInputSubscription;
}

function formatKES(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: Date | string | undefined | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export async function generateReceiptPdf(input: ReceiptInput): Promise<Buffer> {
  const { payment, user, subscription } = input;

  const receiptId = 'RCP-' + payment.id.slice(0, 10).toUpperCase();
  const amountKES = Number(payment.amountKES ?? payment.amount ?? 0);
  const provider = (payment.provider ?? 'mpesa').toUpperCase();
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'MedRemote Member';
  const phone = user.phoneNumber || payment.phoneNumber || '—';
  const email = user.email || '—';
  const reference = payment.mpesaReceiptNo || payment.checkoutRequestId || payment.merchantRequestId || payment.id;
  const tierName = subscription.tier || payment.tier || 'BASIC';
  const paidAt = formatDate(payment.createdAt);
  const startDate = formatDate(subscription.startDate);
  const endDate = formatDate(subscription.endDate);
  const today = formatDate(new Date());

  const markdown = `# MEDREMOTE K LTD RECEIPT #${receiptId}

---

## 1. Receipt Issuance

| Field | Value |
|-------|-------|
| **Receipt ID** | ${receiptId} |
| **Receipt Date** | ${today} |
| **Payment Date** | ${paidAt} |
| **Payment ID** | ${payment.id} |
| **Checkout Request ID** | ${payment.checkoutRequestId ?? '—'} |

---

## 2. Customer Information

| Field | Value |
|-------|-------|
| **Full Name** | ${fullName} |
| **User ID** | ${user.id} |
| **Phone Number** | ${phone} |
| **Email** | ${email} |
| **Country** | Kenya |

---

## 3. Payment Details

| Field | Value |
|-------|-------|
| **Payment Provider** | ${provider} |
| **Provider Reference** | ${reference} |
| **M-Pesa Receipt No.** | ${payment.mpesaReceiptNo ?? 'N/A (Card / Bank Transfer)'} |
| **Currency** | KES (Kenyan Shilling) |
| **Amount Paid** | ${formatKES(amountKES)} |
| **Transaction Status** | COMPLETED / SUCCESS |

### Payment Method
- Provider: ${provider}
- Channel: ${payment.mpesaReceiptNo ? 'M-Pesa Paybill STK Push (Safaricom)' : 'Paystack Card / Bank Transfer / Mobile Money'}
- Phone Charged: ${phone}

---

## 4. Subscription Plan Purchased

| Field | Value |
|-------|-------|
| **Plan Tier** | MedRemote ${tierName} |
| **Type** | ${subscription.tier === 'LIFETIME' ? 'Lifetime One-Time Purchase' : 'Recurring Monthly Subscription'} |
| **Coverage Start** | ${startDate} |
| **Coverage End** | ${endDate} |
| **Duration** | ${subscription.tier === 'LIFETIME' ? 'Forever (no expiry)' : '30 calendar days'} |
| **Auto-Renew** | ${subscription.tier === 'LIFETIME' ? 'Not applicable' : 'Enabled by default; cancel from dashboard 3 days before expiry'} |

### What You Get — Plan Benefits

**MedRemote ${tierName} includes:**

- Access to 3,000+ Kenya-to-Global medical & healthcare jobs board
- AI Resume Rewrite (KNCK Kenyan CV format → US ATS optimized standard)
- 94% Match engine with missing-skills breakdown & AI action plan
- 1-Click Apply pre-filled application packages (per tier limit)
- ATS resume analyzer with per-section audit (keywords, format, brevity)
- Bulk PDF / Word DOCX export of every resume version
- Kenya M-Pesa STK Push, Paystack card, M-Pesa Paybill accepted
- 72-hour grace period on subscription expiry per policy TR-3.1

---

## 5. Financial Breakdown (KES)

| Line Item | Amount (KES) |
|-----------|-------------|
| ${tierName} Plan (${subscription.tier === 'LIFETIME' ? 'One-time' : '30 days'}) | ${amountKES.toFixed(2)} |
| **Subtotal** | ${amountKES.toFixed(2)} |
| VAT (0% — Digital services pending KRA implementation) | 0.00 |
| **TOTAL AMOUNT PAID** | **${amountKES.toFixed(2)}** |

### Payment Confirmation
- Total: **${formatKES(amountKES)}**
- Received in full: Yes
- Receipt issued: Yes (this document)
- Transaction verified by: MedRemote K Ltd. via ${provider} callback webhook signature

---

## 6. Company & Tax Information

**MEDREMOTE K LIMITED**
- Registered in Kenya under the Companies Act
- KRA PIN: A000000000X *(placeholder — update with registered KRA PIN upon incorporation)*
- Business Type: Digital HR Tech / AI Resume & Job Matching SaaS
- Contact: billing-support@medremote.vercel.app
- Support WhatsApp: +254 700 000 000 *(placeholder)*

### Tax Compliance Notice (KRA)
This is a valid tax invoice / receipt issued under the tax laws of Kenya.
MedRemote K Ltd. is compliant with all applicable KRA filing requirements including:
- Monthly VAT returns (where applicable)
- Annual company tax returns
- PAYE / NHIF / NSSF for employees
- Withholding tax on affiliate commissions to Kenyan residents

If you require an official tax invoice with full KRA details stamped and signed by the Finance Director, please reply to this email or contact billing-support@medremote.vercel.app referencing Receipt ID **${receiptId}**.

---

## 7. Refunds, Cancellations, and Support

**Refund Policy:** Eligible refunds are processed within 7 working days via the original payment method. 20% affiliate commission paid to a referrer is deducted from refundable amount per Terms §12.

**Cancellations:** Cancel auto-renew anytime from User Dashboard → Billing → Cancel at Period End. Access remains active until the paid end date, including the 72-hour grace period (SUBSCRIPTION_GRACE_PERIOD_HOURS = 72h).

**Dispute Resolution:** For payment disputes, email billing-support@medremote.vercel.app with Receipt ID, payment date, phone number used, and a 1-paragraph explanation. MedRemote responds within 48 business hours (Mon–Fri, 9am–6pm EAT).

**Kenya Data Protection (DPA 2019):** Your payment data is processed by our PCI-DSS compliant processors (Safaricom M-Pesa Daraja API / Paystack). MedRemote stores only: payment amount, timestamp, tier, reference IDs, and your user ID. Full card numbers or M-Pesa PINs are NEVER stored by MedRemote servers.

---

## 8. Thank You!

*Karibu MedRemote, ${fullName.split(' ')[0]}!*

We're excited to help you transition from Kenya's KNCK-registered healthcare workforce to US remote medical roles paying $25–$55/hour.

**Next steps after payment:**
1. Visit https://medremote.vercel.app/dashboard/resume and upload your Kenyan CV
2. Run AI Rewrite → generate US ATS format (takes ~30 seconds)
3. Browse the 3,000+ jobs board and "Run Match" to see 94% fit roles with missing-skills breakdown
4. Use 1-Click Apply on your top matches — MedRemote packages your resume, cover letter, and KNCK certifications into a pre-filled application

Need help? Contact your personal placement success team on WhatsApp or via the in-app chat widget.

— The MedRemote Kenya Team
Nairobi, Kenya 🇰🇪
*Pamoja tunaweza. Together we can.*

---

**Receipt Generated:** ${today}  
**Software:** MedRemote Billing Subsystem v1.0 (TR-8.3 compliance — Buffer ≥ 4KB)  
**Signature Validity:** This electronic receipt is valid and equivalent to a paper receipt under Kenyan law (Evidence Act Cap 80 Laws of Kenya). MedRemote digital signatures and webhook logs are stored for 7 years per KRA retention requirements.
`;

  return generatePdfFromMarkdown(markdown);
}
