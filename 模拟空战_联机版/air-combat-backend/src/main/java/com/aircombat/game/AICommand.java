package com.aircombat.game;

public record AICommand(
    int turn,
    double throttle,
    boolean fire,
    String targetId
) {
}
