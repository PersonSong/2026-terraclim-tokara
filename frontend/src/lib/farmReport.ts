import type { StatusEntry } from '../api'

export type HealthLevel = 'good' | 'moderate' | 'urgent'

export interface FarmNarrative {
  text: string
  health: HealthLevel
}

export interface Indicator {
  label: string
  value: string
  interpretation: string
}

export interface Recommendation {
  action: string
  why: string
}

const IRRIGATE_THRESHOLD_MM = 25
const REVIEW_THRESHOLD_MM = 15

function formatList(items: string[]): string {
  if (items.length === 0) return 'no blocks'
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

/**
 * 2-3 sentence plain-language summary of the whole estate's water status,
 * computed from the current GET /status response — no API call, no
 * hardcoded per-block text.
 */
export function buildFarmNarrative(blocks: StatusEntry[]): FarmNarrative {
  const total = blocks.length
  const irrigateBlocks = blocks.filter((b) => b.status === 'irrigate')
  const reviewBlocks = blocks.filter((b) => b.status === 'review')
  const needingAttention = irrigateBlocks.length + reviewBlocks.length

  // "Most affected" cultivar(s): the cultivars appearing most often in the
  // most urgent tier present (irrigate if any exist, otherwise review).
  const tierBlocks = irrigateBlocks.length > 0 ? irrigateBlocks : reviewBlocks
  const cultivarCounts = new Map<string, number>()
  tierBlocks.forEach((b) => cultivarCounts.set(b.cultivar, (cultivarCounts.get(b.cultivar) ?? 0) + 1))
  const maxCount = Math.max(0, ...cultivarCounts.values())
  const topCultivars = [...cultivarCounts.entries()]
    .filter(([, count]) => count === maxCount)
    .map(([name]) => name)

  const highest = [...blocks].sort((a, b) => b.depletion_mm - a.depletion_mm)[0]

  const irrigateRatio = total > 0 ? irrigateBlocks.length / total : 0
  const attentionRatio = total > 0 ? needingAttention / total : 0
  let health: HealthLevel
  if (irrigateRatio >= 0.4 || attentionRatio >= 0.75) {
    health = 'urgent'
  } else if (irrigateRatio > 0 || attentionRatio >= 0.34) {
    health = 'moderate'
  } else {
    health = 'good'
  }

  const sentence1 =
    needingAttention > 0
      ? `${needingAttention} of ${total} blocks need attention today — ${irrigateBlocks.length} ready for irrigation and ${reviewBlocks.length} under review — most affecting ${formatList(topCultivars)}.`
      : `All ${total} blocks are within target moisture range today — no irrigation needed.`

  const sentence2 = highest
    ? `${highest.block_id} (${highest.cultivar}) has the highest water deficit on the estate at ${highest.depletion_mm}mm.`
    : ''

  const healthCopy: Record<HealthLevel, string> = {
    good: 'Overall farm water status is good — no widespread action needed.',
    moderate:
      'Overall farm water status is moderate — keep an eye on the review blocks over the next few days.',
    urgent: 'Overall farm water status is urgent — prioritize irrigation today to avoid vine stress.',
  }

  const text = [sentence1, sentence2, healthCopy[health]].filter(Boolean).join(' ')

  return { text, health }
}

function depletionIndicator(block: StatusEntry): Indicator {
  let interpretation: string
  if (block.status === 'irrigate') {
    interpretation = `well past the ${IRRIGATE_THRESHOLD_MM}mm irrigation threshold`
  } else if (block.status === 'review') {
    interpretation = `approaching the ${IRRIGATE_THRESHOLD_MM}mm irrigation threshold — worth monitoring`
  } else {
    interpretation = `comfortably below the ${REVIEW_THRESHOLD_MM}mm review threshold`
  }
  return { label: 'Water deficit', value: `${block.depletion_mm}mm`, interpretation }
}

function ndviIndicator(block: StatusEntry): Indicator {
  let interpretation: string
  if (block.ndvi >= 0.6) {
    interpretation = 'healthy, dense canopy'
  } else if (block.ndvi >= 0.55) {
    interpretation = 'adequate, moderate canopy cover'
  } else {
    interpretation = 'sparser canopy — may indicate water or nutrient stress'
  }
  if (block.stage) {
    interpretation += `, consistent with ${block.stage.toLowerCase()}`
  }
  return { label: 'Canopy vigor (NDVI)', value: block.ndvi.toFixed(2), interpretation }
}

function kcIndicator(block: StatusEntry): Indicator {
  let interpretation: string
  if (block.kc >= 0.83) {
    interpretation = 'high water demand at this growth stage'
  } else if (block.kc >= 0.75) {
    interpretation = 'moderate water demand at this growth stage'
  } else {
    interpretation = 'lower water demand at this growth stage'
  }
  return { label: 'Crop coefficient (Kc)', value: block.kc.toFixed(2), interpretation }
}

/** The indicators driving this block's status, in priority order. */
export function getBlockIndicators(block: StatusEntry): Indicator[] {
  return [depletionIndicator(block), ndviIndicator(block), kcIndicator(block)]
}

/**
 * Recommended action + plain-language "why", assembled from the same
 * indicator values returned by getBlockIndicators — not a separate
 * hardcoded string.
 */
export function getRecommendation(block: StatusEntry, indicators: Indicator[]): Recommendation {
  const [deficit, canopy] = indicators

  if (block.status === 'irrigate') {
    return {
      action: 'Irrigate today',
      why: `Water deficit is at ${deficit.value}, ${deficit.interpretation}, and canopy vigor (${canopy.value}) shows the vine is still active and drawing water — delaying risks stress during a critical growth stage.`,
    }
  }
  if (block.status === 'review') {
    return {
      action: 'Review in the next few days',
      why: `Water deficit is at ${deficit.value}, ${deficit.interpretation}, so it's worth rechecking soil moisture before scheduling irrigation.`,
    }
  }
  return {
    action: 'Hold — no action needed',
    why: `Water deficit remains at ${deficit.value}, ${deficit.interpretation}, so the block is comfortably within target range.`,
  }
}

export function sortByDepletionDescending(blocks: StatusEntry[]): StatusEntry[] {
  return [...blocks].sort((a, b) => b.depletion_mm - a.depletion_mm)
}
