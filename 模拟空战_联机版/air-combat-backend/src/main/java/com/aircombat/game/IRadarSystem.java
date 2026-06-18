package com.aircombat.game;

import java.util.List;

public interface IRadarSystem {

    List<RadarMark> scan(FighterState observer, List<FighterState> targets);

    List<RadarMark> getDetectedTargets();

    void setRange(double range);
}
