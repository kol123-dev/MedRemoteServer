import { env } from '../../config/env.js';
import { resolveDbProvider } from './llm.registry.js';
import {
  TIER_CAPS,
  tierOf,
  tierLimitExhaustedError,
  PaymentTierId,
} from '../../config/featureFlags.js';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export type AiFeature =
  | 'A_RESUME_REWRITE'
  | 'B_MATCHING_RECALC'
  | 'C_COVER_LETTER_GEN'
  | 'MATCH_EXPLAIN';

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'mock';

export interface LlmCompleteOpts {
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  feature: AiFeature;
}

export interface LlmProvider {
  readonly id: ProviderId;
  complete(
    prompt: string,
    system?: string,
    opts?: LlmCompleteOpts,
  ): Promise<{
    output: string;
    model: string;
    promptTokens: number;
    outputTokens: number;
  }>;
}

export interface LlmCompleteResult {
  output: string;
  model: string;
  promptTokens: number;
  outputTokens: number;
  totalCostDecimal: number;
  durationMs: number;
  llmAuditId: string;
}

export class TierLimitExhausted extends Error {
  public readonly code = 402;
  public readonly feature: AiFeature;
  public readonly tier: PaymentTierId;
  constructor(feature: AiFeature, tier: PaymentTierId, message: string) {
    super(message);
    this.name = 'TierLimitExhausted';
    this.feature = feature;
    this.tier = tier;
  }
}

let cachedProvider: LlmProvider | null = null;
let cachedProviderLastId: ProviderId | null = null;
const prisma = new PrismaClient();

const FEATURE_TO_TIER_CAP_KEY: Record<AiFeature, keyof typeof TIER_CAPS.FREE> = {
  A_RESUME_REWRITE: 'maxResumeRewritesPerMonth',
  B_MATCHING_RECALC: 'maxMatchRecalcPerMonth',
  C_COVER_LETTER_GEN: 'maxResumeAnalyzesPerDay',
  MATCH_EXPLAIN: 'maxMatchRecalcPerMonth',
};

/**
 * Determines the most appropriate provider id given the env state.
 * Order of preference goes by which API key is actually configured,
 * otherwise falls back to 'mock'.
 */
function autoProviderId(): ProviderId {
  const configured = (process.env.LLM_PROVIDER || '') as string;
  if (configured && configured !== 'auto') {
    return configured as ProviderId;
  }
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'mock';
}

export function resolveProvider(forceId?: ProviderId): LlmProvider {
  const envOverride = (process.env.LLM_PROVIDER as ProviderId | undefined);
  const id: ProviderId = forceId ?? envOverride ?? autoProviderId();

  if (cachedProvider && cachedProviderLastId === id) return cachedProvider;

  switch (id) {
    case 'openai':
      cachedProvider = new OpenAIProvider();
      break;
    case 'anthropic':
      cachedProvider = new AnthropicProvider();
      break;
    case 'gemini':
      cachedProvider = new GeminiProvider();
      break;
    case 'mock':
    default:
      cachedProvider = new MockProvider();
  }
  cachedProviderLastId = id;
  return cachedProvider;
}

/**
 * Builds a provider from a DB-managed runtime config (admin LLM module).
 * Falls back to the environment-configured provider when no DB provider
 * (or key) is available.
 */
export function buildProviderFromConfig(cfg: {
  provider: 'openai' | 'anthropic' | 'gemini';
  apiKey?: string | null;
  baseUrl?: string | null;
  model: string;
}): LlmProvider {
  const { provider, apiKey, baseUrl, model } = cfg;
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider({ apiKey: apiKey ?? undefined, baseUrl: baseUrl ?? undefined, model });
    case 'gemini':
      return new GeminiProvider({ apiKey: apiKey ?? undefined, model });
    case 'openai':
    default:
      return new OpenAIProvider({ apiKey: apiKey ?? undefined, baseUrl: baseUrl ?? undefined, model });
  }
}

export function estimateCost(
  model: string,
  promptTokens: number,
  outputTokens: number,
): number {
  const modelLower = model.toLowerCase();
  let promptPer1M = 0.15;
  let outputPer1M = 0.6;
  if (modelLower.includes('gpt-4o-mini')) {
    promptPer1M = 0.15;
    outputPer1M = 0.6;
  } else if (modelLower.includes('gpt-4o')) {
    promptPer1M = 2.5;
    outputPer1M = 10;
  } else if (modelLower.includes('claude')) {
    promptPer1M = 3.0;
    outputPer1M = 15;
  }
  const cost =
    (promptTokens / 1_000_000) * promptPer1M +
    (outputTokens / 1_000_000) * outputPer1M;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

async function checkTierBudget(
  userId: string | undefined,
  feature: AiFeature,
  userTierRaw?: PaymentTierId,
): Promise<void> {
  if (!userId) return;
  let tier = userTierRaw;
  if (!tier) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true },
    });
    if (u) {
      const parsed = PaymentTierId.safeParse(u.tier);
      tier = parsed.success ? parsed.data : 'FREE';
    } else {
      tier = 'FREE';
    }
  }
  const caps = TIER_CAPS[tier];
  const capKey = FEATURE_TO_TIER_CAP_KEY[feature];
  const limit = caps[capKey] as number;
  if (typeof limit === 'number' && limit <= 0) {
    const err = tierLimitExhaustedError(feature, tier);
    throw new TierLimitExhausted(feature, tier, err.error);
  }
}

export async function aiComplete(
  prompt: string,
  system?: string,
  opts?: LlmCompleteOpts,
): Promise<LlmCompleteResult> {
  const feature = opts?.feature ?? 'A_RESUME_REWRITE';
  const userId = opts?.userId;

  await checkTierBudget(userId, feature);

  // Prefer a DB-managed provider (admin LLM module) that the user's role can use.
  // Falls back to the env-configured provider when no DB provider applies.
  let provider: LlmProvider;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const dbProvider = await resolveDbProvider({ role: user?.role });
    if (dbProvider?.apiKey) {
      provider = buildProviderFromConfig({
        provider: dbProvider.provider,
        apiKey: dbProvider.apiKey,
        baseUrl: dbProvider.baseUrl,
        model: dbProvider.defaultModel,
      });
    } else {
      provider = resolveProvider();
    }
  } else {
    provider = resolveProvider();
  }

  const startedAt = Date.now();
  let success = false;
  let errorMessage: string | undefined;
  let output = '';
  let model = 'unknown';
  let promptTokens = 0;
  let outputTokens = 0;

  try {
    const result = await provider.complete(prompt, system, opts);
    output = result.output;
    model = result.model;
    promptTokens = result.promptTokens;
    outputTokens = result.outputTokens;
    success = true;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    const durationMs = Date.now() - startedAt;
    const totalCostDecimal = estimateCost(model, promptTokens, outputTokens);
    try {
      await prisma.llmCallAudit.create({
        data: {
          userId,
          feature,
          model,
          promptTokens,
          outputTokens,
          totalCostDecimal,
          durationMs,
          success,
          errorMessage,
        },
      });
    } catch (auditErr) {
      console.warn(
        '[llm.provider] Failed to write LlmCallAudit row:',
        auditErr instanceof Error ? auditErr.message : auditErr,
      );
    }
  }

  const durationMs = Date.now() - startedAt;
  const totalCostDecimal = estimateCost(model, promptTokens, outputTokens);

  return {
    output,
    model,
    promptTokens,
    outputTokens,
    totalCostDecimal,
    durationMs,
    llmAuditId: '',
  };
}

class OpenAIProvider implements LlmProvider {
  readonly id: ProviderId = 'openai';
  private client: OpenAI | null = null;
  private defaultModel: string;
  private readonly apiKey?: string;
  private readonly baseUrl?: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.defaultModel = opts?.model ?? (env.OPENAI_MODEL || 'gpt-4o-mini');
    this.apiKey = opts?.apiKey;
    this.baseUrl = opts?.baseUrl;
  }

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const key = this.apiKey ?? env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY not configured but openai LLM provider selected');
    }
    this.client = new OpenAI({ apiKey: key, ...(this.baseUrl ? { baseURL: this.baseUrl } : {}) });
    return this.client;
  }

  async complete(
    prompt: string,
    system?: string,
    opts?: LlmCompleteOpts,
  ): Promise<{
    output: string;
    model: string;
    promptTokens: number;
    outputTokens: number;
  }> {
    const client = this.getClient();
    const messages: Array<OpenAI.Chat.ChatCompletionMessageParam> = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const temperature = opts?.temperature ?? 0.3;
    const maxTokens = opts?.maxTokens ?? 4096;

    const resp = await client.chat.completions.create({
      model: this.defaultModel,
      messages,
      temperature,
      max_tokens: maxTokens,
    });

    return {
      output: resp.choices[0]?.message?.content ?? '',
      model: resp.model,
      promptTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
    };
  }
}

class AnthropicProvider implements LlmProvider {
  readonly id: ProviderId = 'anthropic';
  private client: Anthropic | null = null;
  private defaultModel: string;
  private readonly apiKey?: string;
  private readonly baseUrl?: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.defaultModel = opts?.model ?? (env.ANTHROPIC_MODEL || 'claude-sonnet-5-5');
    this.apiKey = opts?.apiKey;
    this.baseUrl = opts?.baseUrl;
  }

  private getClient(): Anthropic {
    if (this.client) return this.client;
    const key = this.apiKey ?? env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY not configured but anthropic LLM provider selected');
    }
    this.client = new Anthropic({ apiKey: key, ...(this.baseUrl ? { baseURL: this.baseUrl } : {}) });
    return this.client;
  }

  async complete(
    prompt: string,
    system?: string,
    opts?: LlmCompleteOpts,
  ): Promise<{
    output: string;
    model: string;
    promptTokens: number;
    outputTokens: number;
  }> {
    const client = this.getClient();
    const temperature = opts?.temperature ?? 0.3;
    const maxTokens = opts?.maxTokens ?? 4096;

    // Newer Claude "thinking" models (Sonnet 5.x, Opus 5.x, Fable,
    // Haiku 4.5) deprecate the `temperature` param — omit it there,
    // otherwise the API rejects the request with a 400.
    const isThinkingModel =
      /claude-(sonnet-5|opus-5|fable|haiku-4-5)/.test(this.defaultModel);

    const resp = await client.messages.create({
      model: this.defaultModel,
      max_tokens: maxTokens,
      ...(isThinkingModel ? {} : { temperature }),
      system,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = resp.content
      .filter(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      )
      .map((block) => block.text)
      .join('\n');

    return {
      output: text,
      model: resp.model,
      promptTokens: resp.usage?.input_tokens ?? 0,
      outputTokens: resp.usage?.output_tokens ?? 0,
    };
  }
}

class GeminiProvider implements LlmProvider {
  readonly id: ProviderId = 'gemini';
  private client: GoogleGenerativeAI | null = null;
  private defaultModel: string;
  private readonly apiKey?: string;

  constructor(opts?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.defaultModel = opts?.model ?? (env.GEMINI_MODEL || 'gemini-2.5-flash');
    this.apiKey = opts?.apiKey;
  }

  private getClient(): GoogleGenerativeAI {
    if (this.client) return this.client;
    const key = this.apiKey ?? env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY not configured but gemini LLM provider selected');
    }
    this.client = new GoogleGenerativeAI(key);
    return this.client;
  }

  async complete(
    prompt: string,
    system?: string,
    opts?: LlmCompleteOpts,
  ): Promise<{
    output: string;
    model: string;
    promptTokens: number;
    outputTokens: number;
  }> {
    const client = this.getClient().getGenerativeModel({
      model: this.defaultModel,
    });

    // Gemini uses systemInstruction in a different shape; we merge it
    // into the first message when no separate system slot is available,
    // which keeps the API portable across releases.
    const parts: string[] = [];
    if (system) parts.push(`[SYSTEM]\n${system}\n[/SYSTEM]`);
    parts.push(prompt);

    const temperature = opts?.temperature ?? 0.3;
    const maxOutputTokens = opts?.maxTokens ?? 4096;

    const result = await client.generateContent({
      contents: [{ role: 'user', parts: [{ text: parts.join('\n\n') }] }],
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    });

    const usage = result.response.usageMetadata;
    const estimatedPromptChars = parts.join('\n\n').length;
    const estimatedPromptTokens = Math.ceil(estimatedPromptChars / 4);

    return {
      output: result.response.text(),
      model: this.defaultModel,
      promptTokens: usage?.promptTokenCount ?? estimatedPromptTokens,
      outputTokens: usage?.candidatesTokenCount ?? 0,
    };
  }
}

class MockProvider implements LlmProvider {
  readonly id: ProviderId = 'mock';

  async complete(
    prompt: string,
    system?: string,
    opts?: LlmCompleteOpts,
  ): Promise<{
    output: string;
    model: string;
    promptTokens: number;
    outputTokens: number;
  }> {
    const feature = opts?.feature ?? 'A_RESUME_REWRITE';
    const promptTokens = Math.ceil((prompt.length + (system?.length ?? 0)) / 4);
    let output = '';

    if (feature === 'A_RESUME_REWRITE') {
      output = `# John Doe — Medical Scribe Candidate
## Professional Summary
Kenya-trained clinical professional with 4+ years of patient documentation experience seeking remote US Medical Scribe roles. KNCK registered with mapped US equivalencies and completed ScribeAcademy onboarding.

## Core Competencies
- SOAP / H&P / ROS dictation capture
- Epic & Cerner EHR navigation (certified)
- 75 WPM typing, 99% accuracy
- HIPAA & PHI compliance trained
- ICD-10-CM / CPT code capture basics

## Professional Experience
### Senior Clinical Nurse — Nairobi Referral Hospital (2021 – Present)
\`\`\`
• Documented 30+ daily patient encounters in real time using SOAP format
• Trained 6 new nurses on EHR charting protocols & Kenya MoH standards
• Led discharge summary clinic — reduced turnaround 40% (24h → 14h median)
• Maintained 100% HIPAA-equivalent PHI confidentiality record over 36 months
\`\`\`

## Certifications
- KNCK Registered Nurse (KRN) — US Mapped: RN (CGFNS prereq met)
- ScribeAcademy Certified Graduate (US Scribe 10-week)
- EpicCare Ambulatory Proficiency Badge

## ATS Keyword Densities
SOAP notes (4×), Epic EHR (3×), Medical Scribe (5×), HIPAA (3×), Patient Documentation (4×), Typing 70+ WPM (1×), Clinical Terminology (4×)
`;
    } else if (feature === 'MATCH_EXPLAIN') {
      output = JSON.stringify({
        narrative: 'Excellent 92% semantic match. Your KNCK nursing + Epic cert combination hits the top 5 keywords for this remote scribe post. Only gap is formal orthopedic rotation experience — easily addressable via 2-week MedScribes ortho module.',
        weightedSkillGapsWithActions: [
          { missingSkill: 'Orthopedic scribe experience', howToGet: 'MedScribes Orthopedic Scribe Module (self-paced, free for trainees)', estHoursToAcquire: 16 },
          { missingSkill: 'Dragon NaturallySpeaking dictation software', howToGet: 'Nuance free 30-day trial + YouTube tutorial series, then add to LinkedIn certs', estHoursToAcquire: 6 },
        ],
        percentTo100IfGapsClosed: 99,
      });
    } else if (feature === 'C_COVER_LETTER_GEN') {
      output = `Dear Hiring Team,

I am thrilled to apply for the Remote Medical Scribe position posted on your careers page. As a KNCK-Registered Nurse with four years of direct clinical documentation experience and a recent graduate of the ScribeAcademy US program, I am confident I will deliver immediate value to your provider team.

My clinical background in Nairobi's busy referral ward taught me to stay calm during high-acuity situations while documenting 30+ encounters daily with perfect SOAP structure. I type 75 WPM with 99% accuracy, hold the EpicCare Ambulatory Proficiency badge, and have completed formal HIPAA training aligned with US HITECH standards. My Kenyan training emphasizes rigor, empathy, and teamwork — attributes I will bring to every shift.

I would be grateful for the opportunity to discuss how my experience can support your providers in reducing documentation burden and increasing face-to-face patient time.

Warm regards,
John Doe
KNCK-RN | ScribeAcademy Certified | Epic Badged
`;
    } else {
      output = JSON.stringify({
        overallPct: 88,
        skillBreakdown: {
          present: ['SOAP notes', 'Epic EHR', 'HIPAA'],
          missing: ['Orthopedic rotation'],
          niceToHave: ['Dragon NaturallySpeaking'],
        },
        reasons: ['EXACT_SKILL', 'KEYWORD_HIT', 'CERT_EQUIVALENT'],
        semanticScore: 0.9,
        keywordScore: 0.85,
      });
    }

    const outputTokens = Math.ceil(output.length / 4);

    return {
      output,
      model: 'mock-provider-v1',
      promptTokens,
      outputTokens,
    };
  }
}

export const providers: LlmProvider[] = [
  new OpenAIProvider(),
  new AnthropicProvider(),
  new GeminiProvider(),
  new MockProvider(),
];
