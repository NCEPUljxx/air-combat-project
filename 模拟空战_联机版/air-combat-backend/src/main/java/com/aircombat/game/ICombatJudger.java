package com.aircombat.game;

import java.util.List;

public interface ICombatJudger {

    boolean checkCollision(MissileState missile, FighterState fighter);

    List<HitResult> judgeHit(BattlefieldContext battlefield);

    BattleStatus updateBattleStatus(BattlefieldContext battlefield);
}
