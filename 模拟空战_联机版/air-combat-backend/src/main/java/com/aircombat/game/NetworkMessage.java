package com.aircombat.game;

public record NetworkMessage<T>(
    MessageType type,
    Long roomId,
    Long userId,
    Long tick,
    Long timestamp,
    T payload
) {
}
