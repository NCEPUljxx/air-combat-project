import { ref } from 'vue'
import type { RoomDto } from '../api/roomApi'

export const roomListState = ref<RoomDto[]>([])
export const currentRoomState = ref<RoomDto | null>(null)
