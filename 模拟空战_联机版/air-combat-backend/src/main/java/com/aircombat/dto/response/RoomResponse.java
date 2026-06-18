package com.aircombat.dto.response;

import java.util.List;

public record RoomResponse(
    Long id,
    String name,
    Long ownerUserId,
    String status,
    Integer redCount,
    Integer blueCount,
    List<RoomPlayerResponse> players
) {
}
