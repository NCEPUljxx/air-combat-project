package com.aircombat.game;

import java.util.Optional;

public interface IFighter {

    void move(double deltaSeconds);

    Optional<IMissile> fire(String targetId);

    void takeDamage(int amount);

    void update(double deltaSeconds, BattlefieldContext battlefield);

    FighterState getState();
}
