package com.aircombat.game;

import java.util.List;

public record BattlefieldContext(
    long tick,
    BattleStatus status,
    List<FighterState> fighters,
    List<MissileState> missiles,
    List<RadarMark> radarMarks
) {
}
