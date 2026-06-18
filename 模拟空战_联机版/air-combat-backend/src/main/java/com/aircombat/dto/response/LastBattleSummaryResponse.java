package com.aircombat.dto.response;

import java.util.List;

public record LastBattleSummaryResponse(
    Long battleRecordId,
    Long roomId,
    String winner,
    Integer durationSeconds,
    Integer redTeamKills,
    Integer blueTeamKills,
    List<PlayerBattleRow> players,
    String battleEndedAt
) {
    public record PlayerBattleRow(
        Long userId,
        String nickname,
        String team,
        String fighterModel,
        int kills,
        int damageDealt
    ) {
    }
}
