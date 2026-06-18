package com.aircombat.game;

public interface IAIController {

    AICommand decide(FighterState self, BattlefieldContext battlefield);

    void execute(AICommand command, IFighter fighter);

    void setDifficulty(AIDifficulty level);
}
