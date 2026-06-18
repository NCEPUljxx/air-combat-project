package com.aircombat.game;

public record BombState(
    String id,
    Team team,
    Vector2 position,
    double heading,
    boolean alive,
    long ttlMs,
    double blastRadius,
    int blastDamage
) {
}
