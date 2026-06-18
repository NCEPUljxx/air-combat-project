package com.aircombat.game;

public interface IMissile {

    void launch(Vector2 origin, double heading, String targetId);

    void track(FighterState target, double deltaSeconds);

    void detonate();

    void update(double deltaSeconds, BattlefieldContext battlefield);

    MissileState getState();
}
