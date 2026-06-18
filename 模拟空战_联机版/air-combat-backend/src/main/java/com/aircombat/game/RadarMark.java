package com.aircombat.game;

public record RadarMark(
    String targetId,
    Vector2 position,
    Team team,
    double distance,
    boolean detected
) {
}
