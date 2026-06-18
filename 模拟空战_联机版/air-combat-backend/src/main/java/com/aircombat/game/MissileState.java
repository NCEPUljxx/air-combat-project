package com.aircombat.game;

public record MissileState(
    String id,
    Team team,
    Vector2 position,
    double heading,
    double speed,
    String targetId,
    boolean alive,
    long ttlMs,
    int damage
) {
}
