package com.aircombat.game;

public record HitResult(
    String missileId,
    String fighterId,
    int damage,
    boolean destroyed
) {
}
