import { z } from 'zod';
import { createScorer } from '@mastra/core/evals';
import {
  getAssistantMessageFromRunOutput,
  getUserMessageFromRunInput,
} from '@mastra/evals/scorers/utils';

// Checks all 5 required criteria when CEO ranks microSaaS ideas (Phase 1)
export const ideaScoringCriteriaScorer = createScorer({
  id: 'idea-scoring-criteria',
  name: 'Idea Scoring Criteria Coverage',
  description:
    'Checks that CEO evaluates ideas against all 5 required criteria: willingness to pay, build complexity, distribution, defensibility, and market size',
  type: 'agent',
  judge: {
    model: 'anthropic/claude-sonnet-4-6',
    instructions:
      'You are an expert evaluator of startup CEO decision-making. Assess whether the CEO agent covers all required evaluation criteria when ranking microSaaS ideas.',
  },
})
  .preprocess(({ run }) => ({
    userText: getUserMessageFromRunInput(run.input) || '',
    assistantText: getAssistantMessageFromRunOutput(run.output) || '',
  }))
  .analyze({
    description: 'Check if all 5 idea evaluation criteria are addressed',
    outputSchema: z.object({
      isRankingIdeas: z.boolean(),
      hasWillingnessToPay: z.boolean(),
      hasBuildComplexity: z.boolean(),
      hasDistribution: z.boolean(),
      hasDefensibility: z.boolean(),
      hasMarketSize: z.boolean(),
      criteriaCount: z.number().min(0).max(5),
      explanation: z.string(),
    }),
    createPrompt: ({ results }) => `
You are evaluating a CEO agent's idea ranking output.

User message:
"""
${results.preprocessStepResult.userText}
"""

CEO response:
"""
${results.preprocessStepResult.assistantText}
"""

Determine:
1. Is the CEO ranking or evaluating microSaaS ideas? (isRankingIdeas)
2. If yes, does the response address each of these criteria?
   - Willingness to pay: mentions whether customers already pay for this problem
   - Build complexity: estimates effort / solo developer feasibility (2–4 week MVP)
   - Distribution: mentions acquisition channels (SEO, communities, cold outreach, integrations)
   - Defensibility: mentions stickiness, network effects, integrations, or moat
   - Market size: mentions TAM or revenue potential ($5K–$50K MRR or similar)

Return JSON:
{
  "isRankingIdeas": boolean,
  "hasWillingnessToPay": boolean,
  "hasBuildComplexity": boolean,
  "hasDistribution": boolean,
  "hasDefensibility": boolean,
  "hasMarketSize": boolean,
  "criteriaCount": number,
  "explanation": string
}
`,
  })
  .generateScore(({ results }) => {
    const r = results?.analyzeStepResult || {};
    if (!r.isRankingIdeas) return 1;
    return (r.criteriaCount ?? 0) / 5;
  })
  .generateReason(({ results, score }) => {
    const r = results?.analyzeStepResult || {};
    if (!r.isRankingIdeas) return 'CEO was not ranking ideas — scorer not applicable.';
    const missing = [
      !r.hasWillingnessToPay && 'willingness to pay',
      !r.hasBuildComplexity && 'build complexity',
      !r.hasDistribution && 'distribution',
      !r.hasDefensibility && 'defensibility',
      !r.hasMarketSize && 'market size',
    ].filter(Boolean);
    return `Criteria: ${r.criteriaCount ?? 0}/5 covered. Missing: ${missing.length ? missing.join(', ') : 'none'}. Score=${score}. ${r.explanation ?? ''}`;
  });

// Checks that agent delegation includes specific output format and acceptance criteria
export const delegationSpecificityScorer = createScorer({
  id: 'delegation-specificity',
  name: 'Delegation Specificity',
  description:
    'Checks that CEO instructions to sub-agents include a specific output format and clear acceptance criteria',
  type: 'agent',
  judge: {
    model: 'anthropic/claude-sonnet-4-6',
    instructions:
      'You are an expert evaluator of multi-agent orchestration. Assess whether the CEO gives specific, actionable delegation instructions with clear output expectations.',
  },
})
  .preprocess(({ run }) => ({
    userText: getUserMessageFromRunInput(run.input) || '',
    assistantText: getAssistantMessageFromRunOutput(run.output) || '',
  }))
  .analyze({
    description: 'Check if agent delegation includes output format and acceptance criteria',
    outputSchema: z.object({
      hasDelegation: z.boolean(),
      agentsDelegatedTo: z.array(z.string()),
      hasOutputFormat: z.boolean(),
      hasAcceptanceCriteria: z.boolean(),
      isVague: z.boolean(),
      explanation: z.string(),
    }),
    createPrompt: ({ results }) => `
You are evaluating a CEO agent's delegation quality.

User message:
"""
${results.preprocessStepResult.userText}
"""

CEO response:
"""
${results.preprocessStepResult.assistantText}
"""

Determine:
1. Does the CEO delegate a task to a sub-agent (Market Research Agent, Product Agent, Engineer Agent, Marketing Agent, Research Agent)?
2. If yes:
   - Does it specify what format the output should be in (e.g., a table, a list with specific fields, a JSON structure, bullet points with named fields)?
   - Does it specify acceptance criteria — what "done" looks like or what quality threshold must be met?
   - Is the delegation vague (e.g., just says "research this" or "look into this" without specifics)?

Return JSON:
{
  "hasDelegation": boolean,
  "agentsDelegatedTo": string[],
  "hasOutputFormat": boolean,
  "hasAcceptanceCriteria": boolean,
  "isVague": boolean,
  "explanation": string
}
`,
  })
  .generateScore(({ results }) => {
    const r = results?.analyzeStepResult || {};
    if (!r.hasDelegation) return 1;
    if (r.isVague) return 0.2;
    return ((r.hasOutputFormat ? 1 : 0) + (r.hasAcceptanceCriteria ? 1 : 0)) / 2;
  })
  .generateReason(({ results, score }) => {
    const r = results?.analyzeStepResult || {};
    if (!r.hasDelegation) return 'No delegation found — scorer not applicable.';
    return `Delegation to [${(r.agentsDelegatedTo || []).join(', ')}]: outputFormat=${r.hasOutputFormat}, acceptanceCriteria=${r.hasAcceptanceCriteria}, vague=${r.isVague}. Score=${score}. ${r.explanation ?? ''}`;
  });

// Checks that MVP planning respects scope constraints (Phase 3)
export const mvpDisciplineScorer = createScorer({
  id: 'mvp-discipline',
  name: 'MVP Discipline',
  description:
    'Checks that the CEO enforces MVP scope: ≤5 user stories, 2–4 week timeline, single core workflow, no feature creep',
  type: 'agent',
  judge: {
    model: 'anthropic/claude-sonnet-4-6',
    instructions:
      'You are an expert evaluator of lean startup methodology. Assess whether the CEO enforces MVP discipline and resists scope creep.',
  },
})
  .preprocess(({ run }) => ({
    userText: getUserMessageFromRunInput(run.input) || '',
    assistantText: getAssistantMessageFromRunOutput(run.output) || '',
  }))
  .analyze({
    description: 'Check if MVP planning respects scope constraints',
    outputSchema: z.object({
      isPlanningBuild: z.boolean(),
      userStoryCount: z.number().nullable(),
      timelineWeeks: z.number().nullable(),
      hasSingleCoreWorkflow: z.boolean(),
      hasFeatureCreep: z.boolean(),
      hasProblemStatement: z.boolean(),
      explanation: z.string(),
    }),
    createPrompt: ({ results }) => `
You are evaluating a CEO agent's MVP planning discipline.

User message:
"""
${results.preprocessStepResult.userText}
"""

CEO response:
"""
${results.preprocessStepResult.assistantText}
"""

Determine:
1. Is the CEO planning or speccing an MVP build in this response?
2. If yes:
   - How many user stories are explicitly mentioned? (null if not mentioned)
   - What is the planned timeline in weeks? (null if not mentioned)
   - Does the CEO emphasize a single core workflow rather than multiple features?
   - Does the response show feature creep — many nice-to-haves, complex specs, or more than necessary scope?
   - Does the CEO include or reference a crisp problem statement in the format "[Target user] struggles with [problem]..."?

Return JSON:
{
  "isPlanningBuild": boolean,
  "userStoryCount": number | null,
  "timelineWeeks": number | null,
  "hasSingleCoreWorkflow": boolean,
  "hasFeatureCreep": boolean,
  "hasProblemStatement": boolean,
  "explanation": string
}
`,
  })
  .generateScore(({ results }) => {
    const r = results?.analyzeStepResult || {};
    if (!r.isPlanningBuild) return 1;

    let score = 0;
    let denominator = 0;

    if (r.userStoryCount !== null) {
      denominator++;
      score += r.userStoryCount <= 5 ? 1 : 0;
    }

    if (r.timelineWeeks !== null) {
      denominator++;
      score += r.timelineWeeks >= 2 && r.timelineWeeks <= 4 ? 1 : 0.5;
    }

    denominator++;
    score += r.hasSingleCoreWorkflow ? 1 : 0;

    denominator++;
    score += r.hasFeatureCreep ? 0 : 1;

    denominator++;
    score += r.hasProblemStatement ? 1 : 0;

    return denominator > 0 ? score / denominator : 1;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    if (!r.isPlanningBuild) return 'CEO was not planning a build — scorer not applicable.';
    return `MVP: userStories=${r.userStoryCount ?? 'not stated'} (max 5), timeline=${r.timelineWeeks ?? 'not stated'}wks (target 2–4), singleWorkflow=${r.hasSingleCoreWorkflow}, featureCreep=${r.hasFeatureCreep}, problemStatement=${r.hasProblemStatement}. Score=${score}. ${r.explanation ?? ''}`;
  });

// Checks that the CEO states which phase it's in at the start of each response
export const phaseAwarenessScorer = createScorer({
  id: 'phase-awareness',
  name: 'Phase Awareness',
  description:
    'Checks that the CEO explicitly states its current phase (1–4) early in each response',
  type: 'agent',
  judge: {
    model: 'anthropic/claude-sonnet-4-6',
    instructions:
      'You are an expert evaluator of structured AI agent communication. Assess whether the CEO clearly states its current phase at the start of each response.',
  },
})
  .preprocess(({ run }) => {
    const assistantText = getAssistantMessageFromRunOutput(run.output) || '';
    return {
      responseStart: assistantText.slice(0, 600),
      quickCheck: /phase\s*[1-4]/i.test(assistantText.slice(0, 400)),
    };
  })
  .analyze({
    description: 'Detect if phase is stated clearly and early in the response',
    outputSchema: z.object({
      phaseStated: z.boolean(),
      phaseNumber: z.number().nullable(),
      statedEarly: z.boolean(),
      explanation: z.string(),
    }),
    createPrompt: ({ results }) => `
You are evaluating a CEO agent's phase communication.

CEO response opening (first 600 characters):
"""
${results.preprocessStepResult.responseStart}
"""

Determine:
1. Does the CEO explicitly state which phase it is in (Phase 1: Idea Discovery, Phase 2: Validation, Phase 3: Planning the Build, Phase 4: Orchestrating the Build)?
2. If yes, what phase number (1–4)?
3. Is it stated early — within the first 2–3 sentences or at the very top?

Return JSON:
{
  "phaseStated": boolean,
  "phaseNumber": number | null,
  "statedEarly": boolean,
  "explanation": string
}
`,
  })
  .generateScore(({ results }) => {
    const r = results?.analyzeStepResult;
    if (!r.phaseStated) return 0;
    return r.statedEarly ? 1 : 0.5;
  })
  .generateReason(({ results, score }) => {
    const r = results.analyzeStepResult || {};
    return `Phase awareness: stated=${r.phaseStated}, phase=${r.phaseNumber ?? 'none'}, early=${r.statedEarly}. Score=${score}. ${r.explanation ?? ''}`;
  });

export const ceoScorers = {
  ideaScoringCriteriaScorer,
  delegationSpecificityScorer,
  mvpDisciplineScorer,
  phaseAwarenessScorer,
};
