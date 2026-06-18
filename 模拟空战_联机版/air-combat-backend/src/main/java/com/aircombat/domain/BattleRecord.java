package com.aircombat.domain;

import java.time.LocalDateTime;

public class BattleRecord {

    private Long id;
    private Long roomId;
    private String mode;
    private String winner;
    private Integer durationSeconds;
    private Integer redKills;
    private Integer blueKills;
    private String reportJson;
    private LocalDateTime createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getRoomId() {
        return roomId;
    }

    public void setRoomId(Long roomId) {
        this.roomId = roomId;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public String getWinner() {
        return winner;
    }

    public void setWinner(String winner) {
        this.winner = winner;
    }

    public Integer getDurationSeconds() {
        return durationSeconds;
    }

    public void setDurationSeconds(Integer durationSeconds) {
        this.durationSeconds = durationSeconds;
    }

    public Integer getRedKills() {
        return redKills;
    }

    public void setRedKills(Integer redKills) {
        this.redKills = redKills;
    }

    public Integer getBlueKills() {
        return blueKills;
    }

    public void setBlueKills(Integer blueKills) {
        this.blueKills = blueKills;
    }

    public String getReportJson() {
        return reportJson;
    }

    public void setReportJson(String reportJson) {
        this.reportJson = reportJson;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
