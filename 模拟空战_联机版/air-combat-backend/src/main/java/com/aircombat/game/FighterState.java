package com.aircombat.game;

public record FighterState(
    String id,
    Team team,
    String model,
    Vector2 position,
    double heading,
    double speed,
    int hp,
    int maxHp,
    int missileCount,
    int bombCount,
    boolean alive,
    ControlType controlType,
    String nickname
) {
}
