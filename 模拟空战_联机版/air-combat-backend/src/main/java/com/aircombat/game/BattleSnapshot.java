package com.aircombat.game;

import java.util.List;
import java.util.Map;

public record BattleSnapshot(
    String roomId,
    long tick,
    BattleStatus status,
    List<FighterState> fighters,
    List<MissileState> missiles,
    List<BombState> bombs,
    List<RadarMark> radarMarks,
    List<Map<String, Object>> damagePopups,
    int redAlive,
    int blueAlive,
    long battleElapsedMs
) {
}
