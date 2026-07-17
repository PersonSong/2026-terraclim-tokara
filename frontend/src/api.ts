const API_URL = import.meta.env.VITE_API_URL

export type BlockStatus = 'irrigate' | 'review' | 'hold'

export interface BlockFeature {
  type: 'Feature'
  properties: {
    BLOCK: string
    CULTIVAR: string
  }
  geometry: {
    type: 'Polygon'
    coordinates: number[][][]
  }
}

export interface BlocksResponse {
  type: 'FeatureCollection'
  features: BlockFeature[]
}

export interface DailyStatus {
  date: string
  season: string
  block_id: string
  cultivar: string
  eto_mm: number
  eta_mm: number
  kc: number
  ndvi: number
  depletion_mm: number
  status: BlockStatus
  reason: string
  last_irrigated: string
  hectares: number
}

export interface StatusEntry extends DailyStatus {
  stage: string | null
  phenology_note: string | null
}

export type StatusResponse = StatusEntry[]

export type HistoryResponse = DailyStatus[]

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, options)
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export function getBlocks(): Promise<BlocksResponse> {
  return request('/blocks')
}

export function getStatus(date: string): Promise<StatusResponse> {
  return request(`/status?date=${date}`)
}

export function getBlockHistory(blockId: string): Promise<HistoryResponse> {
  return request(`/block/${blockId}/history`)
}
