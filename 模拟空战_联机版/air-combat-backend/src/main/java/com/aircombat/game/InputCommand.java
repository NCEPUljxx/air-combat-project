package com.aircombat.game;

public record InputCommand(
    int moveX,
    int moveY,
    boolean fire,
    boolean fireBomb,
    String targetId,
    Double fireHeading,
    Double fireBombHeading
) {
}
