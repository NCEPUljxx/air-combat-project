import { invalidateSessionFromApi } from './sessionGuard'

export interface RoomPlayer {
  userId: number
  username: string
  nickname: string
  team: 'RED' | 'BLUE'
  fighterId: string
}

export interface RoomDto {
  id: number
  name: string
  ownerUserId: number
  status: 'WAITING' | 'RUNNING' | 'FINISHED' | 'EXPIRED'
  redCount: number
  blueCount: number
  players: RoomPlayer[]
}

/** Trims slashes and strips a trailing `/api` so callers can use `${root}/api/...` consistently. */
export const normalizeBackendRoot = (baseUrl: string): string => {
  let root = baseUrl.trim()
  while (root.endsWith('/')) {
    root = root.slice(0, -1)
  }
  const lower = root.toLowerCase()
  if (lower.endsWith('/api')) {
    root = root.slice(0, -4)
    while (root.endsWith('/')) {
      root = root.slice(0, -1)
    }
  }
  return root
}

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { message?: string }
    if (payload.message) {
      return payload.message
    }
  } catch {
    // ignore
  }
  return `请求失败(${response.status})`
}

const withToken = (token: string): HeadersInit => ({
  'Content-Type': 'application/json',
  'X-Token': token,
})

/** 401 视为会话被顶替或已注销：清理前端状态 */
const assertOkAuthed = async (response: Response): Promise<void> => {
  if (response.status === 401) {
    invalidateSessionFromApi()
  }
  if (!response.ok) {
    throw new Error(await toErrorMessage(response))
  }
}

export const getRoomApi = async (baseUrl: string, roomId: number): Promise<RoomDto> => {
  const root = normalizeBackendRoot(baseUrl)
  const response = await fetch(`${root}/api/rooms/${roomId}`)
  if (!response.ok) {
    throw new Error(await toErrorMessage(response))
  }
  return (await response.json()) as RoomDto
}

export const listRoomsApi = async (baseUrl: string): Promise<RoomDto[]> => {
  const root = normalizeBackendRoot(baseUrl)
  const response = await fetch(`${root}/api/rooms`)
  if (!response.ok) {
    throw new Error(await toErrorMessage(response))
  }
  return (await response.json()) as RoomDto[]
}

export const createRoomApi = async (baseUrl: string, token: string, name: string): Promise<RoomDto> => {
  const root = normalizeBackendRoot(baseUrl)
  const response = await fetch(`${root}/api/rooms`, {
    method: 'POST',
    headers: withToken(token),
    body: JSON.stringify({ name }),
  })
  await assertOkAuthed(response)
  return (await response.json()) as RoomDto
}

export const joinRoomApi = async (
  baseUrl: string,
  token: string,
  roomId: number,
  team: 'RED' | 'BLUE',
): Promise<RoomDto> => {
  const root = normalizeBackendRoot(baseUrl)
  const response = await fetch(`${root}/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: withToken(token),
    body: JSON.stringify({ team }),
  })
  await assertOkAuthed(response)
  return (await response.json()) as RoomDto
}

export const selectTeamApi = async (
  baseUrl: string,
  token: string,
  roomId: number,
  team: 'RED' | 'BLUE',
): Promise<RoomDto> => {
  const root = normalizeBackendRoot(baseUrl)
  const response = await fetch(`${root}/api/rooms/${roomId}/team`, {
    method: 'POST',
    headers: withToken(token),
    body: JSON.stringify({ team }),
  })
  await assertOkAuthed(response)
  return (await response.json()) as RoomDto
}

export const leaveRoomApi = async (baseUrl: string, token: string, roomId: number): Promise<RoomDto> => {
  const root = normalizeBackendRoot(baseUrl)
  const response = await fetch(`${root}/api/rooms/${roomId}/leave`, {
    method: 'POST',
    headers: withToken(token),
  })
  await assertOkAuthed(response)
  return (await response.json()) as RoomDto
}

export const startRoomApi = async (baseUrl: string, token: string, roomId: number): Promise<RoomDto> => {
  const root = normalizeBackendRoot(baseUrl)
  const response = await fetch(`${root}/api/rooms/${roomId}/start`, {
    method: 'POST',
    headers: withToken(token),
  })
  await assertOkAuthed(response)
  return (await response.json()) as RoomDto
}

export const selectModelApi = async (baseUrl: string, token: string, roomId: number, model: string): Promise<void> => {
  const root = normalizeBackendRoot(baseUrl)
  const response = await fetch(`${root}/api/rooms/${roomId}/model`, {
    method: 'PUT',
    headers: withToken(token),
    body: JSON.stringify({ model }),
  })
  await assertOkAuthed(response)
}

export interface PlayerBattleRow {
  userId: number
  nickname: string
  team: string
  fighterModel: string
  kills: number
  damageDealt: number
}

export interface LastBattleSummaryDto {
  battleRecordId: number | null
  roomId: number
  winner: string | null
  durationSeconds: number | null
  redTeamKills: number | null
  blueTeamKills: number | null
  players: PlayerBattleRow[]
  /** ISO-8601 from REST (optional for WS payloads) */
  battleEndedAt?: string | null
}

export const coerceLastBattleSummaryFromWsFinish = (
  payload: Record<string, unknown>,
): LastBattleSummaryDto | null => {
  const id = payload.battleRecordId
  const battleRecordId = typeof id === 'number' ? id : id != null ? Number(id) : null
  if (battleRecordId == null || Number.isNaN(battleRecordId)) {
    return null
  }
  const rid = payload.roomId
  const roomIdNum = typeof rid === 'number' ? rid : Number(rid) || 0
  const winner = payload.winner != null ? String(payload.winner) : null
  const ds = payload.durationSeconds
  const durationSeconds =
    typeof ds === 'number' ? ds : ds != null ? Math.floor(Number(ds)) : null

  const rk = payload.redTeamKills
  const redTeamKills = typeof rk === 'number' ? rk : rk != null ? Number(rk) : null

  const bk = payload.blueTeamKills
  const blueTeamKills = typeof bk === 'number' ? bk : bk != null ? Number(bk) : null

  const rowsIn = payload.players
  const players: PlayerBattleRow[] = []
  if (Array.isArray(rowsIn)) {
    for (const raw of rowsIn) {
      const row = raw as Record<string, unknown>
      const uid = row.userId
      players.push({
        userId: typeof uid === 'number' ? uid : Number(uid) || 0,
        nickname: String(row.nickname ?? ''),
        team: String(row.team ?? ''),
        fighterModel: String(row.fighterModel ?? ''),
        kills: typeof row.kills === 'number' ? row.kills : Number(row.kills) || 0,
        damageDealt: typeof row.damageDealt === 'number' ? row.damageDealt : Number(row.damageDealt) || 0,
      })
    }
  }

  return {
    battleRecordId,
    roomId: roomIdNum,
    winner,
    durationSeconds,
    redTeamKills,
    blueTeamKills,
    players,
  }
}

export const getBattleHistoryApi = async (
  baseUrl: string,
  token: string,
  roomId: number,
): Promise<LastBattleSummaryDto[]> => {
  const root = normalizeBackendRoot(baseUrl)
  const response = await fetch(`${root}/api/rooms/${roomId}/battle-history`, {
    headers: withToken(token),
  })
  await assertOkAuthed(response)
  return (await response.json()) as LastBattleSummaryDto[]
}

/** Current user's ONLINE battles across all rooms (lobby-visible). */
export const getMyBattleHistoryApi = async (
  baseUrl: string,
  token: string,
  limit = 50,
): Promise<LastBattleSummaryDto[]> => {
  const root = normalizeBackendRoot(baseUrl)
  const q = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, limit))) })
  const response = await fetch(`${root}/api/battles/my-history?${q.toString()}`, {
    headers: withToken(token),
  })
  await assertOkAuthed(response)
  return (await response.json()) as LastBattleSummaryDto[]
}

/** Recent ONLINE battles across all rooms (global feed). */
export const getGlobalBattleHistoryApi = async (
  baseUrl: string,
  token: string,
  limit = 80,
): Promise<LastBattleSummaryDto[]> => {
  const root = normalizeBackendRoot(baseUrl)
  const q = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, limit))) })
  const response = await fetch(`${root}/api/battles/global-history?${q.toString()}`, {
    headers: withToken(token),
  })
  await assertOkAuthed(response)
  return (await response.json()) as LastBattleSummaryDto[]
}

export const getLastBattleSummaryApi = async (
  baseUrl: string,
  token: string,
  roomId: number,
): Promise<LastBattleSummaryDto> => {
  const root = normalizeBackendRoot(baseUrl)
  const response = await fetch(`${root}/api/rooms/${roomId}/last-battle-summary`, {
    headers: withToken(token),
  })
  await assertOkAuthed(response)
  return (await response.json()) as LastBattleSummaryDto
}
