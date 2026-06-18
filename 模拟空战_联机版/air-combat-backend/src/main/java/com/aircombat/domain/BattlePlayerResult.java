package com.aircombat.domain;

import java.time.LocalDateTime;

public class BattlePlayerResult {

    private Long id;
    private Long battleRecordId;
    private Long roomId;
    private Long userId;
    private String nickname;
    private String team;
    private String fighterModel;
    private Integer kills;
    private Integer damageDealt;
    private LocalDateTime createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getBattleRecordId() {
        return battleRecordId;
    }

    public void setBattleRecordId(Long battleRecordId) {
        this.battleRecordId = battleRecordId;
    }

    public Long getRoomId() {
        return roomId;
    }

    public void setRoomId(Long roomId) {
        this.roomId = roomId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }

    public String getTeam() {
        return team;
    }

    public void setTeam(String team) {
        this.team = team;
    }

    public String getFighterModel() {
        return fighterModel;
    }

    public void setFighterModel(String fighterModel) {
        this.fighterModel = fighterModel;
    }

    public Integer getKills() {
        return kills;
    }

    public void setKills(Integer kills) {
        this.kills = kills;
    }

    public Integer getDamageDealt() {
        return damageDealt;
    }

    public void setDamageDealt(Integer damageDealt) {
        this.damageDealt = damageDealt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
