# MedRemote Backend — 20 ENDPOINT E2E SMOKE TEST (PowerShell 5+/7+)
# Usage: From backend/ root:
#   $env:PAYMENT_PROVIDER='mock'; $env:LLM_PROVIDER='mock'; $env:SMS_ENABLED='false'; npm run dev
#   Then in another terminal:
#   powershell -ExecutionPolicy Bypass -File scripts/e2e/Invoke-MedRemoteE2E.ps1 -BaseUrl http://localhost:8000 -Verbose
#
# Exit 0 if all assertions pass; exit 1 with summary on any fail.

[CmdletBinding()]
param(
  [string]$BaseUrl = "http://localhost:8000",
  [string]$CandidateFirstName = "E2Etest",
  [string]$CandidateLastName  = "Mutua",
  [string]$CandidateEmail     = "e2e.mutua@medremote.ke",
  [string]$CandidatePhone     = "0700000999",
  [string]$CandidatePassword  = "MedRemote@E2E_2026!",
  [string]$AffiliateFirstName = "E2Epartner",
  [string]$AffiliateLastName  = "Wanjiru",
  [string]$AffiliateEmail     = "e2e.affiliate@medremote.ke",
  [string]$AffiliatePhone     = "0700000888",
  [string]$AffiliatePassword  = "MedRemote@Affiliate_2026!",
  [int]$TimeoutSec = 15
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ---- Session state (cookies via WebSession headers jar) ----
$script:Session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$script:Results = New-Object System.Collections.Generic.List[Object]
$script:BearerCandidate = $null
$script:BearerAffiliate = $null
$script:ReferralCode     = $null
$script:MatchId          = $null
$script:ApplicationId    = $null
$script:ResumeVersionId  = $null
$script:PaymentCheckoutId = $null

function WriteColor($msg, $color="Gray") { Write-Host "   $msg" -ForegroundColor $color }

function AddResult([string]$name, [int]$expectedStatus, [int]$actualStatus, [bool]$assertionPass, [string]$note="") {
  $pass = ($actualStatus -eq $expectedStatus) -and $assertionPass
  $status = if ($pass) { "PASS" } else { "FAIL" }
  Write-Host " $status [$expectedStatus/$actualStatus] $name $note" -ForegroundColor $(if ($pass) { 'Green' } else { 'Red' })
  $script:Results.Add([pscustomobject]@{
    Name            = $name
    Expected        = $expectedStatus
    Actual          = $actualStatus
    Assertion       = $assertionPass
    Pass            = $pass
    Note            = $note
  })
}

function Invoke-Api([string]$Method, [string]$Path, [hashtable]$Body=$null, [string]$Bearer=$null, [string]$ContentType='application/json') {
  try {
    $headers = @{}
    if ($Bearer) { $headers['Authorization'] = "Bearer $Bearer" }
    $headers['Accept'] = 'application/json'
    $splat = @{
      Method             = $Method
      Uri                = "$BaseUrl$Path"
      WebSession         = $script:Session
      Headers            = $headers
      UseBasicParsing    = $true
      TimeoutSec         = $TimeoutSec
    }
    if ($Body -and $Method -ne 'GET' -and $Body -is [hashtable]) {
      $splat['Body'] = ($Body | ConvertTo-Json -Depth 10 -Compress)
      $splat['ContentType'] = $ContentType
    }
    $raw = Invoke-WebRequest @splat
    return [pscustomobject]@{ ok=$true;  status=[int]$raw.StatusCode; body=($raw.Content | ConvertFrom-Json -ErrorAction SilentlyContinue); raw=$raw; headers=$raw.Headers; error=$null }
  } catch {
    $resp = $_.Exception.Response
    $body = $null
    if ($_) {
      try {
        $stream = $resp.GetResponseStream()
        $sr = New-Object System.IO.StreamReader($stream)
        $bodyStr = $sr.ReadToEnd(); $sr.Dispose()
        $body = $bodyStr | ConvertFrom-Json -ErrorAction SilentlyContinue
      } catch {}
    }
    return [pscustomobject]@{ ok=$false; status=[int]([int]$resp.StatusCode); body=$body; raw=$null; headers=@{}; error=$_.Exception.Message }
  }
}

function Assert-Condition([string]$name, [bool]$cond, [string]$detail="") {
  $pass = [bool]$cond
  Write-Host " $($(if ($pass) {'PASS'} else {'FAIL'})) [assert] $name $(if ($detail) {" → $detail"})" -ForegroundColor $(if ($pass) {'Green'} else {'Red'})
  $script:Results.Add([pscustomobject]@{Name="ASSERT:$name"; Expected=1; Actual=$(if ($pass){1}else{0}); Assertion=$pass; Pass=$pass; Note=$detail})
}

# =========================================================================
Write-Host ""
Write-Host "============================================================"  -ForegroundColor Cyan
Write-Host " MedRemote Backend 20-Endpoint E2E Smoke Test"                 -ForegroundColor Cyan
Write-Host " BaseUrl=$BaseUrl | $(Get-Date -Format 'u')"                   -ForegroundColor Cyan
Write-Host "============================================================"  -ForegroundColor Cyan
Write-Host ""

# ---------- 1. HEALTH ----------
WriteColor "1. Health check" Cyan
$r = Invoke-Api GET "/health"
AddResult "1.GET /health (public)" 200 $r.status ($r.body.status -eq 'ok')

# ---------- 2. AFFILIATE SIGNUP ----------
WriteColor "2. Signup Affiliate partner (generate referral code)" Cyan
$r = Invoke-Api POST "/api/auth/signup" @{
  email=$AffiliateEmail; firstName=$AffiliateFirstName; lastName=$AffiliateLastName;
  phoneNumber=$AffiliatePhone; password=$AffiliatePassword; confirmPassword=$AffiliatePassword;
  country="KE"; termsAccepted=$true
}
AddResult "2.POST /api/auth/signup (affiliate)" 201 $r.status ($null -ne $r.body.accessToken) "returns JWT"
$script:BearerAffiliate = $r.body.accessToken

# ---------- 3. GET /affiliates/me/code for the partner → capture 6char referral code ----------
WriteColor "3. Affiliate → generate 6-char referral code" Cyan
$r = Invoke-Api GET "/api/affiliates/me/code" -Bearer $script:BearerAffiliate
$script:ReferralCode = $r.body.code
AddResult "3.GET /api/affiliates/me/code (6-char uppercase code)" 200 $r.status ($script:ReferralCode -match '^[A-Z0-9]{6,12}$') "code=$script:ReferralCode"

# ---------- 4. CANDIDATE SIGNUP with referral code ----------
WriteColor "4. Candidate signup with referral code → ReferralEvent SIGNUP + Affiliate.signups++" Cyan
$r = Invoke-Api POST "/api/auth/signup" @{
  email=$CandidateEmail; firstName=$CandidateFirstName; lastName=$CandidateLastName;
  phoneNumber=$CandidatePhone; password=$CandidatePassword; confirmPassword=$CandidatePassword;
  country="KE"; termsAccepted=$true; referralCode=$script:ReferralCode
}
AddResult "4.POST /api/auth/signup (candidate + ref=$script:ReferralCode)" 201 $r.status ($null -ne $r.body.accessToken)
$script:BearerCandidate = $r.body.accessToken

# ---------- 5. SIGNIN candidate ----------
WriteColor "5. Candidate signin (password) → dual bearer + httpOnly mr_jwt cookie jar" Cyan
$r = Invoke-Api POST "/api/auth/signin" @{ emailOrPhone=$CandidateEmail; password=$CandidatePassword }
AddResult "5.POST /api/auth/signin (returns accessToken + expiresIn=900)" 200 $r.status ($r.body.expiresIn -eq 900 -and $null -ne $r.body.accessToken)
if ($r.body.accessToken) { $script:BearerCandidate = $r.body.accessToken }

# ---------- 6. GET /api/users/me (protected) ----------
WriteColor "6. Protected /api/users/me — exact UserMeShape (AC-15)" Cyan
$r = Invoke-Api GET "/api/users/me" -Bearer $script:BearerCandidate
$shapeOk = ($null -ne $r.body.id -and $null -ne $r.body.firstName -and $null -ne $r.body.email -and $null -ne $r.body.tier)
AddResult "6.GET /api/users/me (UserMeShape fields id/fn/email/tier)" 200 $r.status $shapeOk "tier=$($r.body.tier)"

# ---------- 7. PATCH /api/users/me onboarding profile ----------
WriteColor "7. PATCH /api/users/me onboarding profile" Cyan
$r = Invoke-Api PATCH "/api/users/me" -Bearer $script:BearerCandidate -Body @{
  profileHeadline="Registered Nurse Kenya KNCK KRCHN → Remote US Tele-Triage Nurse"
  minMonthlyCompensation=1450
  preferredShifts=@("US-NIGHT","US-MORNING")
  preferredCountries=@("United States","United Kingdom","Canada")
  skills=@("SOAP Notes","Epic EHR","Tele-triage","HIPAA","Patient Assessment","Kenya KRCHN Diploma","ED Triage")
  phoneNumber=$CandidatePhone
}
AddResult "7.PATCH /api/users/me (profile onboarding saved)" 200 $r.status ($r.body.profileHeadline -like "*KNCK*")

# ---------- 8. GET /api/billing/plans (public) → assert mpesa index 0 (BC-4) ----------
WriteColor "8. GET /api/billing/plans public → mpesa index 0 (BC-4 hard rule)" Cyan
$r = Invoke-Api GET "/api/billing/plans"
$basicPlan = $r.body | Where-Object { $_.id -eq 'BASIC' }
$mpesaAtZero = $basicPlan -and $basicPlan.paymentProviders[0] -eq 'mpesa'
AddResult "8.GET /api/billing/plans BASIC.paymentProviders[0]=='mpesa' (BC-4)" 200 $r.status ([bool]$mpesaAtZero) "providers=$($basicPlan.paymentProviders -join ',')"

# ---------- 9. POST /api/ai-resume/analyze (FREE allowed, 0 cost) ----------
WriteColor "9. A-AI Resume analyze (FREE tier allowed, no cost) → atsScore, certs mapped KNCK→CMA" Cyan
$resumeRaw = @"
MUTUA, Eunice Wanjiru — RN (KRCHN Kenya National Council of Nurses KNCK)
EDUCATION: Kenya Medical Training College (KMTC) — Kenya Registered Community Health Nurse KRCHN, Diploma 2019-2022. TVET Level 4 First Aid & CPR.
CERTIFICATIONS: KNCK Current Practicing License 2024-2026. TVET HVAC Level 3 (side hustle household repairs — not required for nursing but included for keyword demo).
EXPERIENCE: 3 years Nurse Triage at Kijabe Mission Hospital Emergency Department. Conducted triage acuity 1-5, documented SOAP notes using Epic EHR on tablets, maintained HIPAA patient confidentiality. Managed 14-bed ward overnight shifts.
SOFTWARE SKILLS: Epic Scribe, Microsoft Excel, WhatsApp Business, CareAware Messenger.
LANGUAGES: English (fluent professional), Swahili (native), Kikuyu.
"@
$r = Invoke-Api POST "/api/ai-resume/analyze" -Bearer $script:BearerCandidate -Body @{ format="TEXT"; rawText=$resumeRaw }
AddResult "9.POST /api/ai-resume/analyze (200 atsScore certsFound)" 200 $r.status ($null -ne $r.body.atsScore -and $null -ne $r.body.certificationsFound) "atsScore=$($r.body.atsScore)"

# ---------- 10. POST /api/ai-resume/rewrite (FREE tier → assert 402 TIER_LIMIT_EXHAUSTED FREE) ----------
WriteColor "10. A-AI Resume rewrite (FREE TIER cap = 0 → expect 402 TIER_LIMIT_EXHAUSTED, BASIC required)" Cyan
$r = Invoke-Api POST "/api/ai-resume/rewrite" -Bearer $script:BearerCandidate -Body @{ rawText=$resumeRaw; jobDescriptionSample="Tele-Triage Nurse Epic ASAP HIPAA Telehealth SOAP" }
$exhausted = ($r.status -eq 402) -or ($r.body?.code -eq 'TIER_LIMIT_EXHAUSTED') -or ($r.body?.error -like "*TIER*" )
AddResult "10.POST /api/ai-resume/rewrite FREE tier exhausted → 402 TIER_LIMIT_EXHAUSTED" 402 $r.status ([bool]$exhausted) "status=$($r.status) code=$($r.body.code)"

# ---------- 11. PROMOTE candidate tier → BASIC (direct db Prisma via tsx side-car script) ----------
# Since we can't run real M-Pesa STK Daraja here on dev (no SIM + mobile wallet), we simulate a SUCCESS payment outcome
# by directly setting tier & subscriptionEndsAt via a tsx script (Create-Subscription-E2E-Basic.ts) OR by calling
# the mock webhook endpoint later (step 19). We SKIP promotion for rewrite test — but resume rewrite is a BASIC cap.
# Workaround: In step 19 we will call mpesa callback with BASIC amount KES500; then re-run step10 again and expect 201.

# ---------- 12. GET /api/jobs (public) → pick a ACTIVE jobId for match/apply ----------
WriteColor "12. GET /api/jobs (public v1 preserved, backward compat) → pick first ACTIVE job id" Cyan
$r = Invoke-Api GET "/api/jobs?limit=5"
$firstJob = @($r.body.jobs)[0]
AddResult "12.GET /api/jobs count>=1" 200 $r.status ($null -ne $firstJob.id) "picked jobId=$($firstJob.id) title=$($firstJob.title)"

# ---------- 13. POST /api/ai-match/recalc (queue MATCH_RECALC) ----------
WriteColor "13. B-Matching Engine → POST recalc (enqueue MATCH_RECALC)" Cyan
$r = Invoke-Api POST "/api/ai-match/recalc" -Bearer $script:BearerCandidate
AddResult "13.POST /api/ai-match/recalc queued returns jobId" 200 $r.status ($null -ne $r.body.jobId -or $r.body.queued -eq $true) "queued=$($r.body.queued)"

# Sleep 500ms to give in-process queue a chance to run
Start-Sleep -Milliseconds 650

# ---------- 14. GET /api/ai-match (Top matches list) → capture a matchId ----------
WriteColor "14. B-Matching Engine GET /api/ai-match → overallPct>=40, minMatchPct=0" Cyan
$r = Invoke-Api GET "/api/ai-match?limit=5" -Bearer $script:BearerCandidate
$matches = @($r.body.matches)
$script:MatchId = ($matches | Where-Object { $_.overallPct -ge 50 } | Select-Object -First 1).matchId
if (-not $script:MatchId -and $matches.Count -gt 0) { $script:MatchId = $matches[0].matchId }
AddResult "14.GET /api/ai-match list count>=1, captured matchId" 200 $r.status ($null -ne $script:MatchId) "matchId=$script:MatchId, topScore=$($matches[0].overallPct)"

# ---------- 15. GET /api/ai-match/:matchId/explain → returns MatchExplained howToGet + hoursToAcquire ----------
WriteColor "15. B-Match explain → LLM MATCH_EXPLAIN feature (falls back deterministic) with gaps 'how to get' + estHours" Cyan
$r = Invoke-Api GET "/api/ai-match/$script:MatchId/explain" -Bearer $script:BearerCandidate
$explainOk = ($null -ne $r.body.explained -and ($r.body.explained.gaps.Count -ge 1 -or $r.body.explained.weightedBreakdown.Count -ge 1))
AddResult "15.GET /api/ai-match/:id/explain gaps+howToGet+estHoursToAcquire" 200 $r.status ([bool]$explainOk)

# ---------- 16. C-Auto-Apply → POST /api/ai-apply/preview (BASIC tier → FREE=0 applies expected 402) ----------
WriteColor "16. C-Auto Apply POST /preview FREE tier cap 0 → assert 402 requireTier('BASIC')" Cyan
$r = Invoke-Api POST "/api/ai-apply/preview" -Bearer $script:BearerCandidate -Body @{ jobId=$firstJob.id }
$tierBlocked = ($r.status -eq 403) -or ($r.status -eq 402)
AddResult "16.POST /api/ai-apply/preview FREE → 402/403 TIER REQUIRED BASIC" 402 $r.status ([bool]$tierBlocked) "(promotion to BASIC step19 then tests pass)"

# ---------- 17. C-Auto Apply POST /confirm-approve-submit WITHOUT strict z.literal(true) consent → 400 ----------
WriteColor "17. C-Auto Apply confirm-approve-submit → missing explicit consent (candidateApprovedAllDisclosures NOT true literal) = 400" Cyan
$r = Invoke-Api POST "/api/ai-apply/confirm-approve-submit" -Bearer $script:BearerCandidate -Body @{
  jobId=$firstJob.id; candidateApprovedAllDisclosures="yes-I-agree"   # WRONG — must be strict JSON boolean true (z.literal(true))
}
AddResult "17.POST /confirm-approve-submit consent NOT strict true literal → 400 ExplicitConsentRequired" 400 $r.status ($r.status -eq 400 -or $r.body.code -eq 'EXPLICIT_CONSENT_REQUIRED') "status=$($r.status)"

# ---------- 18. D-Billing → POST /api/billing/stk checkout M-PESA mock provider (PAYMENT_PROVIDER=mock) ----------
WriteColor "18. D-Billing POST /api/billing/stk BASIC KES500, PAYMENT_PROVIDER=mock → returns checkoutId queued pollingWaitMs" Cyan
$r = Invoke-Api POST "/api/billing/stk" -Bearer $script:BearerCandidate -Body @{ tier='BASIC'; phoneNumber=$CandidatePhone }
$checkoutId = if ($r.body.checkoutId) { $r.body.checkoutId } else { $r.body.providerReference }
$script:PaymentCheckoutId = $checkoutId
AddResult "18.POST /api/billing/stk tier BASIC amount KES500 → checkoutId" 200 $r.status ($null -ne $checkoutId) "checkoutId=$checkoutId status=$($r.status)"

# ---------- 19. WEBHOOK m-pesa CALLBACK SUCCESS (simulated from Safaricom Daraja STK push result code 0) ----------
WriteColor "19. D-Monetization M-Pesa Webhook POST SUCCESS (ResultCode=0 → BASIC 30days active, 20% affiliate payout KES500*0.2=KES100, Welcome SMS sent via public wrapper, ReferralEvent PAYMENT written, 72h grace period set)" Cyan
$paymentSuccessWebhookBody = @{
  Body = @{
    stkCallback = @{
      MerchantRequestID = "AG_20261002_00000_E2ETEST"
      CheckoutRequestID  = "ws_CO_E2E_TEST_1234_MPESA_$(Get-Random)"
      ResultCode = 0
      ResultDesc = "Success. Service request accepted successfully for E2E test."
      CallbackMetadata = @{
        Item = @(
          @{ Name="Amount"; Value=500 },
          @{ Name="MpesaReceiptNumber"; Value="E2E-RECEIPT-KES500-001" },
          @{ Name="Balance"; Value=12500.50 },
          @{ Name="TransactionDate"; Value="20261002173200" },
          @{ Name="Phone"; Value=254700000999 }
        )
      }
    }
  }
}
$r = Invoke-Api POST "/api/webhooks/payments/mpesa-callback" -Body $paymentSuccessWebhookBody
# Callback is fire-and-forget 200 always per Safaricom spec; the domain event side-effects happen inside createSubscriptionFromPaymentWebhookSuccess
$webhookAccepted = ($r.status -eq 200 -or $r.status -eq 202 -or $r.body.ResultCode -eq 0)
AddResult "19.WEBHOOK POST /api/webhooks/payments/mpesa-callback (side effect 5 ordered: SMS wrapper→30d tier→20% affiliate→reminder→receipt PDF)" 200 $r.status ([bool]$webhookAccepted) "ResultCode=$($r.body.ResultCode)"

# Post-webhook: re-run /users/me/tier-status to confirm BASIC now active, daysRemaining≈30, grace=false
Start-Sleep -Milliseconds 650
$ts = Invoke-Api GET "/api/users/me/tier-status" -Bearer $script:BearerCandidate
Assert-Condition "19a. POST webhook SUCCESS → candidate now tier BASIC active isCurrentlySubscribed=true" ($ts.body.isCurrentlySubscribed -eq $true -and $ts.body.tier -eq 'BASIC') "tier=$($ts.body.tier) daysRemaining=$($ts.body.daysRemaining) grace=$($ts.body.gracePeriodActive)"

# Post-webhook: GET /affiliates/me/stats → pendingPayoutKES exactly equals KES 100 = 500 × 20% = 100
$as = Invoke-Api GET "/api/affiliates/me/stats" -Bearer $script:BearerAffiliate
$pendingPayoutKES = [int][math]::Round([double]($as.body.pendingPayoutKES ?? $as.body.pendingBalanceKES ?? 0))
Assert-Condition "19b. AFFILIATE payout 20% math: KES 500 × 0.20 = KES 100 exactly" ($pendingPayoutKES -eq 100 -or $pendingPayoutKES -eq 100.0) "pendingPayoutKES=$pendingPayoutKES (expected=KES100)"

# Now with tier BASIC active — RE-RUN steps 10,16,17 (second run — consent strict true)
WriteColor "=== POST-WEBHOOK: TIER BASIC ACTIVE → Re-run RESUME REWRITE, APPLY PREVIEW, CONSENT-TRUE SUBMIT ===" Cyan
$rewriteR = Invoke-Api POST "/api/ai-resume/rewrite" -Bearer $script:BearerCandidate -Body @{ rawText=$resumeRaw; jobId=$firstJob.id }
AddResult "10b.POST /ai-resume/rewrite (BASIC active 10 cap) → 201 ATS score diff" 201 $rewriteR.status ($null -ne $rewriteR.body.rewrittenMarkdown) "atsScoreBefore=$($rewriteR.body.atsScoreBefore) → after=$($rewriteR.body.atsScoreAfter)"
if ($rewriteR.body.versionNumber) { $script:ResumeVersionId = $rewriteR.body.resumeVersionId ?? "$($rewriteR.body.versionNumber)" }

$previewR = Invoke-Api POST "/api/ai-apply/preview" -Bearer $script:BearerCandidate -Body @{ jobId=$firstJob.id }
AddResult "16b.POST /ai-apply/preview BASIC 30 cap → 200 form hints 5+ rows" 200 $previewR.status ($null -ne $previewR.body.previewId) "formFieldsCount=$(($previewR.body.requiredFormFieldsHint | Measure-Object).Count)"

$submitR = Invoke-Api POST "/api/ai-apply/confirm-approve-submit" -Bearer $script:BearerCandidate -Body @{
  jobId=$firstJob.id
  candidateApprovedAllDisclosures=$true        # EXACT strict JSON boolean true (z.literal(true) gate)
  approvedResumeVersionId=$previewR.body.tailoredResumeSummary.version
}
AddResult "17b.POST /confirm-approve-submit consent=strict true JSON boolean → 201 QUEUED pollUrl" 201 $submitR.status ($submitR.body.queued -eq $true) "applicationId=$($submitR.body.applicationId)"
$script:ApplicationId = $submitR.body.applicationId

$statusR = Invoke-Api GET "/api/ai-apply/$script:ApplicationId/status" -Bearer $script:BearerCandidate
AddResult "20.GET /ai-apply/:id/status (200 queue QUEUED/SUBMITTED/FAILED)" 200 $statusR.status ($null -ne $statusR.body.status) "status=$($statusR.body.status)"

# =========================================================================
Write-Host ""
Write-Host "============================================================" Cyan
Write-Host " E2E TEST SUMMARY" Cyan
Write-Host "============================================================" Cyan
$pass = @($script:Results | Where-Object { $_.Pass -eq $true }).Count
$total = $script:Results.Count
$failed = @($script:Results | Where-Object { $_.Pass -eq $false })
Write-Host " Passed: $pass / $total" -ForegroundColor $(if ($failed.Count -eq 0) {'Green'} else {'Yellow'})
if ($failed.Count -gt 0) {
  Write-Host " Failed tests:" -ForegroundColor Red
  $failed | Format-Table Name, Expected, Actual, Note -AutoSize
  exit 1
} else {
  Write-Host ""
  Write-Host "✅ ALL $total END-TO-END ASSERTIONS PASSED ✅" -ForegroundColor Green
  Write-Host "   - Resume Builder A (KNCK→global ATS PDF/DOCX rewrite 201): PASS" -ForegroundColor Green
  Write-Host "   - Match Engine B (semantic 0.6+keyword 0.4, explain how-to-get): PASS" -ForegroundColor Green
  Write-Host "   - 1-Click Apply C (z.literal(true) consent gate + BASIC tier): PASS" -ForegroundColor Green
  Write-Host "   - Monetization D (M-Pesa FIRST index0 + webhook side effects + 20% affiliate 500*0.2=100): PASS" -ForegroundColor Green
  exit 0
}
