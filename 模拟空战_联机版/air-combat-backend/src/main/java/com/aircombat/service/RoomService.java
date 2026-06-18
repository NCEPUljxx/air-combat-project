package com.aircombat.service;

import com.aircombat.domain.BattlePlayerResult;
import com.aircombat.domain.BattleRecord;
import com.aircombat.domain.Room;
import com.aircombat.domain.RoomPlayer;
import com.aircombat.domain.User;
import com.aircombat.dto.response.LastBattleSummaryResponse;
import com.aircombat.config.AirCombatProperties;
import com.aircombat.dto.response.RoomPlayerResponse;
import com.aircombat.dto.response.RoomResponse;
import com.aircombat.mapper.BattlePlayerResultMapper;
import com.aircombat.mapper.BattleRecordMapper;
import com.aircombat.mapper.RoomMapper;
import com.aircombat.mapper.RoomPlayerMapper;
import com.aircombat.mapper.UserMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
public class RoomService {

    private static final DateTimeFormatter ISO_TS = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final AuthService authService;
    private final RoomMapper roomMapper;
    private final RoomPlayerMapper roomPlayerMapper;
    private final UserMapper userMapper;
    private final BattleRecordMapper battleRecordMapper;
    private final BattlePlayerResultMapper battlePlayerResultMapper;
    private final OnlineGameService onlineGameService;
    private final int maxTeamSize;

    public RoomService(
        AuthService authService,
        RoomMapper roomMapper,
        RoomPlayerMapper roomPlayerMapper,
        UserMapper userMapper,
        BattleRecordMapper battleRecordMapper,
        BattlePlayerResultMapper battlePlayerResultMapper,
        OnlineGameService onlineGameService,
        AirCombatProperties airCombatProperties
    ) {
        this.authService = authService;
        this.roomMapper = roomMapper;
        this.roomPlayerMapper = roomPlayerMapper;
        this.userMapper = userMapper;
        this.battleRecordMapper = battleRecordMapper;
        this.battlePlayerResultMapper = battlePlayerResultMapper;
        this.onlineGameService = onlineGameService;
        this.maxTeamSize = airCombatProperties.getGame().getMaxTeamSize();
    }

    public RoomResponse createRoom(String token, String name) {
        AuthService.SessionUser owner = authService.requireUserByToken(token);
        String roomName = normalizeRoomName(name);

        Room room = new Room();
        room.setName(roomName);
        room.setOwnerUserId(owner.userId());
        room.setStatus("WAITING");
        room.setRedCount(0);
        room.setBlueCount(0);
        roomMapper.insert(room);

        RoomPlayer ownerPlayer = new RoomPlayer();
        ownerPlayer.setRoomId(room.getId());
        ownerPlayer.setUserId(owner.userId());
        ownerPlayer.setTeam("RED");
        ownerPlayer.setFighterId(fighterIdFor("RED", owner.userId()));
        roomPlayerMapper.insert(ownerPlayer);
        refreshRoomCounts(room.getId());

        return toResponse(requireRoom(room.getId()), true);
    }

    public List<RoomResponse> listRooms() {
        List<Room> rooms = roomMapper.findAll();
        List<RoomResponse> responses = new ArrayList<>();
        for (Room room : rooms) {
            responses.add(toResponse(room, false));
        }
        return responses;
    }

    public RoomResponse getRoom(Long roomId) {
        return toResponse(requireRoom(roomId), true);
    }

    public LastBattleSummaryResponse getLastBattleSummary(String token, Long roomId) {
        AuthService.SessionUser user = authService.requireUserByToken(token);
        requireRoom(roomId);
        BattleRecord br = battleRecordMapper.findLatestOnlineByRoomId(roomId);
        boolean inRoom = roomPlayerMapper.findByRoomAndUser(roomId, user.userId()) != null;
        if (!inRoom) {
            if (br == null) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "无权查看该房间战报");
            }
            if (battlePlayerResultMapper.countByBattleAndUser(br.getId(), user.userId()) == 0) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "无权查看该房间战报");
            }
        }
        if (br == null) {
            return new LastBattleSummaryResponse(null, roomId, null, null, null, null, List.of(), null);
        }
        return toSummaryResponseFromRecord(roomId, br);
    }

    public List<LastBattleSummaryResponse> getBattleHistory(String token, Long roomId) {
        AuthService.SessionUser user = authService.requireUserByToken(token);
        requireRoom(roomId);
        if (roomPlayerMapper.findByRoomAndUser(roomId, user.userId()) == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "请先加入房间以查看对战历史");
        }
        List<BattleRecord> records = battleRecordMapper.findOnlineBattlesForRoom(roomId, 50);
        List<LastBattleSummaryResponse> out = new ArrayList<>(records.size());
        for (BattleRecord br : records) {
            out.add(toSummaryResponseFromRecord(roomId, br));
        }
        return out;
    }

    /** Cross-room ONLINE battles for current user (lobby-visible). */
    public List<LastBattleSummaryResponse> getMyBattleHistory(String token, int limit) {
        AuthService.SessionUser user = authService.requireUserByToken(token);
        int safeLimit = Math.min(100, Math.max(1, limit));
        List<BattleRecord> records = battleRecordMapper.findOnlineBattlesForUser(user.userId(), safeLimit);
        List<LastBattleSummaryResponse> out = new ArrayList<>(records.size());
        for (BattleRecord br : records) {
            Long rid = br.getRoomId();
            if (rid == null) {
                continue;
            }
            out.add(toSummaryResponseFromRecord(rid, br));
        }
        return out;
    }

    /** Recent ONLINE battles across all rooms (any logged-in user). */
    public List<LastBattleSummaryResponse> getGlobalOnlineBattleHistory(String token, int limit) {
        authService.requireUserByToken(token);
        int safeLimit = Math.min(100, Math.max(1, limit));
        List<BattleRecord> records = battleRecordMapper.findOnlineBattlesGlobally(safeLimit);
        List<LastBattleSummaryResponse> out = new ArrayList<>(records.size());
        for (BattleRecord br : records) {
            Long rid = br.getRoomId();
            if (rid == null) {
                continue;
            }
            out.add(toSummaryResponseFromRecord(rid, br));
        }
        return out;
    }

    private LastBattleSummaryResponse toSummaryResponseFromRecord(Long roomId, BattleRecord br) {
        if (br == null) {
            return new LastBattleSummaryResponse(null, roomId, null, null, null, null, List.of(), null);
        }
        List<BattlePlayerResult> rows = battlePlayerResultMapper.findByBattleRecordId(br.getId());
        List<LastBattleSummaryResponse.PlayerBattleRow> players = new ArrayList<>(rows.size());
        for (BattlePlayerResult r : rows) {
            String team = r.getTeam() != null ? r.getTeam().trim().toUpperCase() : "";
            players.add(new LastBattleSummaryResponse.PlayerBattleRow(
                r.getUserId(),
                r.getNickname() != null ? r.getNickname() : "",
                team,
                r.getFighterModel() != null ? r.getFighterModel() : "",
                r.getKills() != null ? r.getKills() : 0,
                r.getDamageDealt() != null ? r.getDamageDealt() : 0
            ));
        }
        return new LastBattleSummaryResponse(
            br.getId(),
            roomId,
            br.getWinner(),
            br.getDurationSeconds(),
            br.getRedKills(),
            br.getBlueKills(),
            players,
            br.getCreatedAt() == null ? null : br.getCreatedAt().format(ISO_TS)
        );
    }

    public RoomResponse joinRoom(String token, Long roomId, String rawTeam) {
        AuthService.SessionUser user = authService.requireUserByToken(token);
        Room room = requireRoom(roomId);
        ensureJoinable(room);
        String team = normalizeTeam(rawTeam);

        RoomPlayer existed = roomPlayerMapper.findByRoomAndUser(roomId, user.userId());
        if (existed != null) {
            if (!team.equals(existed.getTeam())) {
                if (countTeamMembers(roomId, team) >= maxTeamSize) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "该队伍已满");
                }
                roomPlayerMapper.updateTeam(roomId, user.userId(), team, fighterIdFor(team, user.userId()));
            }
        } else {
            if (countTeamMembers(roomId, team) >= maxTeamSize) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "该队伍已满");
            }
            RoomPlayer roomPlayer = new RoomPlayer();
            roomPlayer.setRoomId(roomId);
            roomPlayer.setUserId(user.userId());
            roomPlayer.setTeam(team);
            roomPlayer.setFighterId(fighterIdFor(team, user.userId()));
            roomPlayerMapper.insert(roomPlayer);
        }

        refreshRoomCounts(roomId);
        return toResponse(requireRoom(roomId), true);
    }

    public RoomResponse selectTeam(String token, Long roomId, String rawTeam) {
        AuthService.SessionUser user = authService.requireUserByToken(token);
        Room room = requireRoom(roomId);
        ensureJoinable(room);
        String team = normalizeTeam(rawTeam);

        RoomPlayer existed = roomPlayerMapper.findByRoomAndUser(roomId, user.userId());
        if (existed == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "你还没有加入该房间");
        }

        if (!team.equals(existed.getTeam())) {
            if (countTeamMembers(roomId, team) >= maxTeamSize) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "该队伍已满");
            }
            roomPlayerMapper.updateTeam(roomId, user.userId(), team, fighterIdFor(team, user.userId()));
        }
        refreshRoomCounts(roomId);
        return toResponse(requireRoom(roomId), true);
    }

    public RoomResponse leaveRoom(String token, Long roomId) {
        AuthService.SessionUser user = authService.requireUserByToken(token);
        Room room = requireRoom(roomId);
        if (Objects.equals(user.userId(), room.getOwnerUserId())) {
            roomMapper.updateStatus(roomId, "EXPIRED");
            roomPlayerMapper.deleteAllByRoomId(roomId);
            roomMapper.updateCounts(roomId, 0, 0);
            onlineGameService.disbandRoom(roomId, "OWNER_LEFT");
            return toResponse(requireRoom(roomId), true);
        }
        roomPlayerMapper.deleteByRoomAndUser(roomId, user.userId());
        refreshRoomCounts(roomId);
        return toResponse(requireRoom(roomId), true);
    }

    public RoomResponse startRoom(String token, Long roomId) {
        AuthService.SessionUser user = authService.requireUserByToken(token);
        Room room = requireRoom(roomId);
        if (!Objects.equals(user.userId(), room.getOwnerUserId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "只有房主可以开始房间");
        }
        if (!"WAITING".equals(room.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "房间已开始或已结束");
        }
        refreshRoomCounts(roomId);
        roomMapper.updateStatus(roomId, "RUNNING");
        return toResponse(requireRoom(roomId), true);
    }

    private Room requireRoom(Long roomId) {
        Room room = roomMapper.findById(roomId);
        if (room == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "房间不存在");
        }
        return room;
    }

    private void ensureJoinable(Room room) {
        if (!"WAITING".equals(room.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "房间不在等待状态，无法加入或选队");
        }
    }

    private int countTeamMembers(Long roomId, String team) {
        return roomPlayerMapper.countByRoomAndTeam(roomId, team);
    }

    private void refreshRoomCounts(Long roomId) {
        int redCount = countTeamMembers(roomId, "RED");
        int blueCount = countTeamMembers(roomId, "BLUE");
        roomMapper.updateCounts(roomId, redCount, blueCount);
    }

    private String normalizeRoomName(String name) {
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "房间名不能为空");
        }
        String normalized = name.trim();
        if (normalized.length() > 80) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "房间名不能超过 80 字符");
        }
        return normalized;
    }

    private String normalizeTeam(String team) {
        if (team == null || team.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "team 不能为空");
        }
        String normalized = team.trim().toUpperCase();
        if (!"RED".equals(normalized) && !"BLUE".equals(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "team 仅支持 RED 或 BLUE");
        }
        return normalized;
    }

    private String fighterIdFor(String team, Long userId) {
        return team.toLowerCase() + "-" + userId;
    }

    private RoomResponse toResponse(Room room, boolean includePlayers) {
        List<RoomPlayerResponse> players = includePlayers ? loadPlayers(room.getId()) : List.of();
        return new RoomResponse(
            room.getId(),
            room.getName(),
            room.getOwnerUserId(),
            room.getStatus(),
            room.getRedCount(),
            room.getBlueCount(),
            players
        );
    }

    private List<RoomPlayerResponse> loadPlayers(Long roomId) {
        List<RoomPlayer> roomPlayers = roomPlayerMapper.findByRoomId(roomId);
        List<RoomPlayerResponse> players = new ArrayList<>();
        for (RoomPlayer roomPlayer : roomPlayers) {
            User user = userMapper.findById(roomPlayer.getUserId());
            if (user == null) {
                continue;
            }
            players.add(new RoomPlayerResponse(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                roomPlayer.getTeam(),
                roomPlayer.getFighterId()
            ));
        }
        return players;
    }
}
