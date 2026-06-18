package com.aircombat.service;

import com.aircombat.config.AirCombatProperties;
import com.aircombat.domain.BattlePlayerResult;
import com.aircombat.domain.BattleRecord;
import com.aircombat.domain.Room;
import com.aircombat.domain.RoomPlayer;
import com.aircombat.domain.User;
import com.aircombat.game.BattleSnapshot;
import com.aircombat.game.BattleStatus;
import com.aircombat.game.BombState;
import com.aircombat.game.ControlType;
import com.aircombat.game.FighterState;
import com.aircombat.game.INetworkProtocol;
import com.aircombat.game.InputCommand;
import com.aircombat.game.JsonNetworkProtocol;
import com.aircombat.game.MessageType;
import com.aircombat.game.MissileState;
import com.aircombat.game.NetworkMessage;
import com.aircombat.game.RadarMark;
import com.aircombat.game.Team;
import com.aircombat.game.Vector2;
import com.aircombat.mapper.BattlePlayerResultMapper;
import com.aircombat.mapper.BattleRecordMapper;
import com.aircombat.mapper.RoomMapper;
import com.aircombat.mapper.RoomPlayerMapper;
import com.aircombat.mapper.UserMapper;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

@Service
public class OnlineGameService {

    private static final Logger log = LoggerFactory.getLogger(OnlineGameService.class);

    private static final double WORLD_WIDTH = 3600.0;
    private static final double WORLD_HEIGHT = 2160.0;
    private static final double ONLINE_RADAR_RANGE = 900.0;
    private static final double MISSILE_MAX_TURN_RAD_PER_SEC = Math.PI * 2.8;
    private static final double BASELINE_CATALOG_SPEED = 180.0;
    private static final double BASELINE_MOVE_PX_PER_TICK = 6.0;
    private static final double MISSILE_SPEED_PX = 14.0;
    private static final double BOMB_SPEED_PX = 7.0;
    private static final long BOMB_TTL_MS = 3000L;
    private static final double BOMB_PROXIMITY_DIST = 30.0;
    private static final double FIGHTER_COLLISION_DIST = 30.0;
    private static final long COLLISION_COOLDOWN_TICKS = 60L;
    private static final double AWACS_SPEED_PER_TICK = 5.0;
    private static final double AWACS_STOP_DIST = 80.0;
    private static final String[] AI_MODELS = {"J-20", "J-16", "J-10C", "J-25"};
    private static final Random RAND = new Random();
    private static final double BLUE_AI_STAT_FACTOR = 0.7;

    /** WebSocket close codes 4000+ are private use; inform client of session takeover / auth invalidation. */
    private static final CloseStatus CLOSE_SESSION_REPLACED = new CloseStatus(4000, "SESSION_REPLACED");
    private static final CloseStatus CLOSE_AUTH_REVOKED = new CloseStatus(4001, "AUTH_REVOKED");

    private static final int ARV_CHECK_EVERY_N_INPUTS = 20;
    private static final long ARV_CHECK_INTERVAL_MS = 2000L;

    private record ModelStats(
        int hp,
        int missiles,
        int bombs,
        int catalogSpeed,
        int missileDamage,
        int bombDamage,
        double bombRadius,
        double pixelsPerTick
    ) {}

    private static final Map<String, ModelStats> MODEL_STATS = Map.of(
        "J-20", new ModelStats(150, 32, 7, 230, 40, 80, 110.0, 230.0 / BASELINE_CATALOG_SPEED * BASELINE_MOVE_PX_PER_TICK),
        "J-16", new ModelStats(220, 48, 12, 180, 55, 120, 140.0, 180.0 / BASELINE_CATALOG_SPEED * BASELINE_MOVE_PX_PER_TICK),
        "J-10C", new ModelStats(170, 40, 9, 200, 45, 90, 120.0, 200.0 / BASELINE_CATALOG_SPEED * BASELINE_MOVE_PX_PER_TICK),
        "J-25", new ModelStats(130, 24, 5, 260, 50, 100, 130.0, 260.0 / BASELINE_CATALOG_SPEED * BASELINE_MOVE_PX_PER_TICK),
        "F-16", new ModelStats(130, 12, 4, 160, 36, 70, 95.0, 160.0 / BASELINE_CATALOG_SPEED * BASELINE_MOVE_PX_PER_TICK)
    );

    private final AuthService authService;
    private final RoomMapper roomMapper;
    private final RoomPlayerMapper roomPlayerMapper;
    private final BattleRecordMapper battleRecordMapper;
    private final BattlePlayerResultMapper battlePlayerResultMapper;
    private final UserMapper userMapper;
    private final TaskExecutor gameTaskExecutor;
    private final TaskExecutor calculationTaskExecutor;
    private final INetworkProtocol networkProtocol = new JsonNetworkProtocol();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ScheduledExecutorService tickScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "air-combat-tick");
        t.setDaemon(true);
        return t;
    });
    private final int maxTeamSize;
    private final int tickRate;
    private final long tickMillis;

    private final Map<String, ConnectionContext> connectionsBySessionId = new ConcurrentHashMap<>();
    private final Map<Long, Set<WebSocketSession>> sessionsByRoomId = new ConcurrentHashMap<>();
    private final Map<Long, Set<Long>> onlineUsersByRoomId = new ConcurrentHashMap<>();
    private final Map<Long, RoomRuntime> runtimeByRoomId = new ConcurrentHashMap<>();
    private final Map<Long, Map<Long, String>> playerModelByRoomId = new ConcurrentHashMap<>();
    private final Map<Long, String> nicknameByUserId = new ConcurrentHashMap<>();
    /** At most one game WebSocket per (roomId, userId); new connection replaces the old. */
    private final Map<String, WebSocketSession> primarySessionByRoomAndUser = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> inputBatchCounterBySessionId = new ConcurrentHashMap<>();
    private final Map<String, Long> lastArvCheckMsBySessionId = new ConcurrentHashMap<>();

    public OnlineGameService(
        AuthService authService,
        RoomMapper roomMapper,
        RoomPlayerMapper roomPlayerMapper,
        BattleRecordMapper battleRecordMapper,
        BattlePlayerResultMapper battlePlayerResultMapper,
        UserMapper userMapper,
        @Qualifier("gameTaskExecutor") TaskExecutor gameTaskExecutor,
        @Qualifier("calculationTaskExecutor") TaskExecutor calculationTaskExecutor,
        AirCombatProperties airCombatProperties
    ) {
        this.authService = authService;
        this.roomMapper = roomMapper;
        this.roomPlayerMapper = roomPlayerMapper;
        this.battleRecordMapper = battleRecordMapper;
        this.battlePlayerResultMapper = battlePlayerResultMapper;
        this.userMapper = userMapper;
        this.gameTaskExecutor = gameTaskExecutor;
        this.calculationTaskExecutor = calculationTaskExecutor;
        this.maxTeamSize = airCombatProperties.getGame().getMaxTeamSize();
        this.tickRate = Math.max(10, airCombatProperties.getGame().getTickRate());
        this.tickMillis = Math.max(20L, 1000L / this.tickRate);
    }

    @PostConstruct
    public void startSchedulers() {
        tickScheduler.scheduleAtFixedRate(this::dispatchTicks, tickMillis, tickMillis, TimeUnit.MILLISECONDS);
        tickScheduler.scheduleAtFixedRate(this::expireStaleRooms, 60, 60, TimeUnit.SECONDS);
    }

    public ConnectionContext connect(WebSocketSession session, String token, Long roomId) {
        AuthService.SessionUser user = authService.requireUserByToken(token);
        Room room = requireRoom(roomId);
        if ("EXPIRED".equals(room.getStatus())) {
            throw new ResponseStatusException(HttpStatus.GONE, "房间已超时解散");
        }
        RoomPlayer roomPlayer = roomPlayerMapper.findByRoomAndUser(roomId, user.userId());
        if (roomPlayer == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "你不在该房间内");
        }

        User dbUser = userMapper.findById(user.userId());
        if (dbUser == null || dbUser.getAuthRevision() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "用户状态异常");
        }
        long sessionArv = dbUser.getAuthRevision();

        nicknameByUserId.put(user.userId(), user.nickname());

        ConnectionContext context = new ConnectionContext(session.getId(), roomId, user.userId(), sessionArv);
        connectionsBySessionId.put(session.getId(), context);
        sessionsByRoomId.computeIfAbsent(roomId, key -> ConcurrentHashMap.newKeySet()).add(session);
        onlineUsersByRoomId.computeIfAbsent(roomId, key -> ConcurrentHashMap.newKeySet()).add(user.userId());

        String dedupeKey = roomId + ":" + user.userId();
        WebSocketSession previous = primarySessionByRoomAndUser.put(dedupeKey, session);
        if (previous != null && previous.isOpen() && !previous.getId().equals(session.getId())) {
            try {
                previous.close(Objects.requireNonNull(CLOSE_SESSION_REPLACED));
            } catch (IOException ignored) {
            }
        }

        publishRoomEvent(roomId, "PLAYER_ONLINE", Map.of("userId", user.userId(), "username", user.username()));
        sendCurrentSnapshot(roomId, session);
        return context;
    }

    public void disconnect(String sessionId) {
        ConnectionContext context = connectionsBySessionId.remove(sessionId);
        if (context == null) {
            return;
        }
        inputBatchCounterBySessionId.remove(sessionId);
        lastArvCheckMsBySessionId.remove(sessionId);

        Long roomId = context.roomId();
        Set<WebSocketSession> roomSessions = sessionsByRoomId.get(roomId);
        if (roomSessions != null) {
            roomSessions.removeIf(s -> sessionId.equals(s.getId()));
        }

        String dedupeKey = roomId + ":" + context.userId();
        WebSocketSession primary = primarySessionByRoomAndUser.get(dedupeKey);
        if (primary != null && sessionId.equals(primary.getId())) {
            primarySessionByRoomAndUser.remove(dedupeKey);
        }

        Set<Long> onlineUsers = onlineUsersByRoomId.get(roomId);
        if (onlineUsers != null && roomSessions != null) {
            boolean stillConnected = false;
            for (WebSocketSession s : roomSessions) {
                ConnectionContext c = connectionsBySessionId.get(s.getId());
                if (c != null && c.userId().equals(context.userId())) {
                    stillConnected = true;
                    break;
                }
            }
            if (!stillConnected) {
                onlineUsers.remove(context.userId());
            }
        }

        publishRoomEvent(roomId, "PLAYER_OFFLINE", Map.of("userId", context.userId()));
    }

    public void handleClientMessage(WebSocketSession session, String rawMessage) {
        String sessionId = session.getId();
        ConnectionContext context = connectionsBySessionId.get(sessionId);
        if (context == null) {
            return;
        }
        try {
            if (!sessionReauthStillValid(session, context)) {
                return;
            }
            NetworkMessage<?> message = networkProtocol.deserialize(rawMessage);
            if (message.type() != MessageType.MSG_PLAYER_INPUT) {
                sendError(context.roomId(), "仅支持 MSG_PLAYER_INPUT");
                return;
            }
            RoomRuntime runtime = runtimeByRoomId.get(context.roomId());
            if (runtime == null) {
                sendError(context.roomId(), "房间尚未开始");
                return;
            }
            InputCommand input = objectMapper.convertValue(message.payload(), InputCommand.class);
            String fighterId = runtime.userFighterId.get(context.userId());
            if (fighterId != null) {
                runtime.latestInputs.put(fighterId, input);
                if (runtime.status == BattleStatus.RUNNING) {
                    if (input.fire()) {
                        runtime.pendingMissileByFighter.put(
                            fighterId,
                            new PendingMissileIntent(input.fireHeading(), input.targetId())
                        );
                    }
                    if (input.fireBomb()) {
                        runtime.pendingBombByFighter.put(fighterId, new PendingBombIntent(input.fireBombHeading()));
                    }
                }
            }
        } catch (IllegalArgumentException exception) {
            sendError(context.roomId(), "输入消息格式错误");
        }
    }

    /**
     * Throttled check: new login bumps {@code auth_revision}, invalidating old JWT sessions still connected.
     */
    private boolean sessionReauthStillValid(WebSocketSession session, ConnectionContext context) {
        int n = inputBatchCounterBySessionId.computeIfAbsent(session.getId(), k -> new AtomicInteger(0)).incrementAndGet();
        long now = System.currentTimeMillis();
        Long last = lastArvCheckMsBySessionId.get(session.getId());
        boolean shouldCheck = (n % ARV_CHECK_EVERY_N_INPUTS == 0) || last == null || now - last >= ARV_CHECK_INTERVAL_MS;
        if (!shouldCheck) {
            return true;
        }
        lastArvCheckMsBySessionId.put(session.getId(), now);
        User db = userMapper.findById(context.userId());
        if (db == null || db.getAuthRevision() == null || !Objects.equals(db.getAuthRevision(), context.sessionAuthRevision())) {
            try {
                session.close(Objects.requireNonNull(CLOSE_AUTH_REVOKED));
            } catch (IOException ignored) {
            }
            return false;
        }
        return true;
    }

    public void announceCountdownAndScheduleBattle(Long roomId) {
        publishRoomEvent(roomId, "MATCH_COUNTDOWN", Map.of("seconds", 3));
        tickScheduler.schedule(() -> startRoom(roomId), 3, TimeUnit.SECONDS);
    }

    public void startRoom(Long roomId) {
        Room room = roomMapper.findById(roomId);
        if (room == null || "EXPIRED".equals(room.getStatus())) {
            return;
        }
        RoomRuntime runtime = runtimeByRoomId.computeIfAbsent(roomId, this::initRuntime);
        publishRoomEvent(roomId, "BATTLE_STARTED", Map.of("roomId", roomId));
        broadcastSnapshot(runtime);
    }

    public void selectPlayerModel(String token, Long roomId, String model) {
        AuthService.SessionUser user = authService.requireUserByToken(token);
        if (!MODEL_STATS.containsKey(model)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "无效机型: " + model);
        }
        playerModelByRoomId.computeIfAbsent(roomId, k -> new ConcurrentHashMap<>()).put(user.userId(), model);
    }

    @PreDestroy
    public void shutdown() {
        tickScheduler.shutdownNow();
    }

    private void dispatchTicks() {
        for (RoomRuntime runtime : runtimeByRoomId.values()) {
            if (runtime.status != BattleStatus.RUNNING) {
                continue;
            }
            gameTaskExecutor.execute(() -> tick(runtime));
        }
    }

    private void tick(RoomRuntime runtime) {
        synchronized (runtime) {
            if (runtime.status != BattleStatus.RUNNING) {
                return;
            }
            runtime.tick++;

            List<MissileState> launchedMissiles = new ArrayList<>();
            List<Map<String, Object>> hitEvents = new ArrayList<>();
            List<Map<String, Object>> currentPopups = new ArrayList<>();

            Set<Long> onlineUsers = onlineUsersByRoomId.getOrDefault(runtime.roomId, Set.of());
            stepAiNoseForAiFighters(runtime, onlineUsers);
            List<FighterProbe> fightersBeforeMove = copyFighterProbes(runtime.fighters.values(), onlineUsers);
            Map<String, InputCommand> aiCommands = CompletableFuture.supplyAsync(
                () -> buildAiCommands(fightersBeforeMove, onlineUsers),
                calculationTaskExecutor
            ).join();

            // Move AWACS units: follow centroid of alive teammates
            for (FighterRuntime fighter : runtime.fighters.values()) {
                if (!fighter.alive || !fighter.isAwacs) {
                    continue;
                }
                double sumX = 0, sumY = 0;
                int count = 0;
                for (FighterRuntime f : runtime.fighters.values()) {
                    if (f.alive && !f.isAwacs && f.team == fighter.team) {
                        sumX += f.x;
                        sumY += f.y;
                        count++;
                    }
                }
                if (count > 0) {
                    double targetX = sumX / count;
                    double targetY = sumY / count;
                    double dx = targetX - fighter.x;
                    double dy = targetY - fighter.y;
                    double dist = Math.hypot(dx, dy);
                    if (dist > AWACS_STOP_DIST) {
                        fighter.heading = Math.atan2(dy, dx);
                        double speed = Math.min(AWACS_SPEED_PER_TICK, dist * 0.03);
                        fighter.x = clamp(fighter.x + Math.cos(fighter.heading) * speed, 50, WORLD_WIDTH - 50);
                        fighter.y = clamp(fighter.y + Math.sin(fighter.heading) * speed, 50, WORLD_HEIGHT - 50);
                    }
                }
            }

            // Process player/AI move commands
            for (FighterRuntime fighter : runtime.fighters.values()) {
                if (!fighter.alive || fighter.isAwacs) {
                    continue;
                }
                boolean playerOnline = fighter.userId != null && onlineUsers.contains(fighter.userId);
                fighter.controlType = playerOnline ? ControlType.PLAYER : ControlType.AI;
                InputCommand command = playerOnline ? runtime.latestInputs.get(fighter.id) : aiCommands.get(fighter.id);
                if (command == null) {
                    command = new InputCommand(0, 0, false, false, null, null, null);
                }
                applyMove(fighter, command);
                if (playerOnline) {
                    fighter.aiNoseHeading = fighter.heading;
                }

                PendingMissileIntent pendingMissile = runtime.pendingMissileByFighter.remove(fighter.id);
                boolean fireMissile = command.fire() || pendingMissile != null;
                if (fireMissile && fighter.missileCount > 0) {
                    Double fh = command.fireHeading();
                    String tid = command.targetId();
                    if (pendingMissile != null) {
                        if (fh == null) {
                            fh = pendingMissile.fireHeading();
                        }
                        if (tid == null) {
                            tid = pendingMissile.targetId();
                        }
                    }
                    MissileRuntime missile = createMissile(runtime, fighter, tid, fh);
                    runtime.missiles.put(missile.id, missile);
                    fighter.missileCount--;
                    launchedMissiles.add(toMissileState(missile));
                }

                PendingBombIntent pendingBomb = runtime.pendingBombByFighter.remove(fighter.id);
                boolean fireBomb = command.fireBomb() || pendingBomb != null;
                if (fireBomb && fighter.bombCount > 0) {
                    Double fh = command.fireBombHeading();
                    if (pendingBomb != null && fh == null) {
                        fh = pendingBomb.fireBombHeading();
                    }
                    double bombHeading = fighter.heading;
                    if (fh != null) {
                        bombHeading = fh;
                    }
                    BombRuntime bomb = createBomb(runtime, fighter, bombHeading);
                    runtime.bombs.put(bomb.id, bomb);
                    fighter.bombCount--;
                }
            }

            // Move missiles (optional homing under friendly AWACS coverage)
            for (MissileRuntime missile : runtime.missiles.values()) {
                if (!missile.alive) {
                    continue;
                }
                steerMissile(runtime, missile);
                missile.x += Math.cos(missile.heading) * MISSILE_SPEED_PX;
                missile.y += Math.sin(missile.heading) * MISSILE_SPEED_PX;
                missile.ttlMs -= tickMillis;
                if (missile.ttlMs <= 0
                        || missile.x < 0 || missile.x > WORLD_WIDTH
                        || missile.y < 0 || missile.y > WORLD_HEIGHT) {
                    missile.alive = false;
                }
            }

            // Move bombs and check proximity fuse
            List<FighterProbe> fighterProbesForBomb = copyFighterProbes(runtime.fighters.values(), onlineUsers);
            for (BombRuntime bomb : runtime.bombs.values()) {
                if (!bomb.alive) {
                    continue;
                }
                bomb.x += Math.cos(bomb.heading) * BOMB_SPEED_PX;
                bomb.y += Math.sin(bomb.heading) * BOMB_SPEED_PX;
                bomb.ttlMs -= tickMillis;

                boolean shouldDetonate = bomb.ttlMs <= 0
                    || bomb.x < 0 || bomb.x > WORLD_WIDTH
                    || bomb.y < 0 || bomb.y > WORLD_HEIGHT;

                if (!shouldDetonate) {
                    for (FighterProbe fp : fighterProbesForBomb) {
                        if (fp.alive() && fp.team() != bomb.team
                                && distance(bomb.x, bomb.y, fp.x(), fp.y()) < BOMB_PROXIMITY_DIST) {
                            shouldDetonate = true;
                            break;
                        }
                    }
                }

                if (shouldDetonate) {
                    bomb.alive = false;
                    for (FighterRuntime f : runtime.fighters.values()) {
                        if (!f.alive || f.team == bomb.team) {
                            continue;
                        }
                        double dist = distance(bomb.x, bomb.y, f.x, f.y);
                        if (dist <= bomb.blastRadius) {
                            int dmg = bomb.blastDamage;
                            boolean wasAlive = f.alive;
                            f.hp = Math.max(0, f.hp - dmg);
                            if (f.hp == 0) {
                                f.alive = false;
                            }
                            creditPlayerCombat(runtime, bomb.ownerFighterId, f, dmg, wasAlive);
                            currentPopups.add(Map.of(
                                "id", "pop-b-" + bomb.id + "-" + f.id,
                                "x", f.x, "y", f.y,
                                "damage", dmg,
                                "team", f.team.name(),
                                "ttlMs", 760
                            ));
                        }
                    }
                }
            }
            runtime.bombs.values().removeIf(b -> !b.alive);

            // Missile hit detection
            List<FighterProbe> fighterProbes = copyFighterProbes(runtime.fighters.values(), onlineUsers);
            List<MissileProbe> missileProbes = copyMissileProbes(runtime.missiles.values());
            CompletableFuture<List<HitCandidate>> hitTask = CompletableFuture.supplyAsync(
                () -> detectHits(fighterProbes, missileProbes),
                calculationTaskExecutor
            );
            CompletableFuture<List<RadarMark>> radarTask = CompletableFuture.supplyAsync(
                () -> scanRadarMarks(fighterProbes),
                calculationTaskExecutor
            );

            for (HitCandidate candidate : hitTask.join()) {
                FighterRuntime fighter = runtime.fighters.get(candidate.fighterId());
                MissileRuntime missile = runtime.missiles.get(candidate.missileId());
                if (fighter == null || missile == null || !fighter.alive || !missile.alive) {
                    continue;
                }
                int hpBefore = fighter.hp;
                fighter.hp -= candidate.damage();
                if (fighter.hp <= 0) {
                    fighter.hp = 0;
                    fighter.alive = false;
                }
                missile.alive = false;
                creditPlayerCombat(runtime, missile.ownerFighterId, fighter, candidate.damage(), hpBefore > 0);
                hitEvents.add(Map.of(
                    "missileId", missile.id,
                    "fighterId", fighter.id,
                    "damage", candidate.damage(),
                    "destroyed", !fighter.alive
                ));
                currentPopups.add(Map.of(
                    "id", "pop-m-" + missile.id,
                    "x", fighter.x, "y", fighter.y,
                    "damage", candidate.damage(),
                    "team", fighter.team.name(),
                    "ttlMs", 760
                ));
            }

            // Fighter-fighter collision detection
            detectFighterCollisions(runtime, fighterProbes, currentPopups);

            runtime.radarMarks = radarTask.join();
            runtime.missiles.values().removeIf(missile -> !missile.alive);
            runtime.damagePopups = currentPopups;

            BattleSnapshot snapshot = toSnapshot(runtime);

            PersistedBattleSummary battlePersisted = null;
            if (snapshot.status() != BattleStatus.RUNNING) {
                runtime.status = snapshot.status();
                roomMapper.updateStatus(runtime.roomId, "WAITING");
                battlePersisted = saveBattleRecord(runtime, snapshot);
            }

            // 不再广播 MSG_FIGHTER_MOVE：快照 MSG_BATTLE_STATUS 已含 fighters，避免每 tick 双倍 JSON。
            if (!launchedMissiles.isEmpty()) {
                broadcast(
                    runtime.roomId,
                    new NetworkMessage<>(MessageType.MSG_MISSILE_LAUNCH, runtime.roomId, null, runtime.tick, Instant.now().toEpochMilli(), launchedMissiles)
                );
            }
            if (!hitEvents.isEmpty()) {
                broadcast(
                    runtime.roomId,
                    new NetworkMessage<>(MessageType.MSG_HIT_RESULT, runtime.roomId, null, runtime.tick, Instant.now().toEpochMilli(), hitEvents)
                );
            }
            broadcast(
                runtime.roomId,
                new NetworkMessage<>(MessageType.MSG_BATTLE_STATUS, runtime.roomId, null, runtime.tick, Instant.now().toEpochMilli(), snapshot)
            );

            if (snapshot.status() != BattleStatus.RUNNING) {
                Map<String, Object> finishPayload = new HashMap<>();
                finishPayload.put("status", snapshot.status().name());
                finishPayload.put("roomId", runtime.roomId);
                if (battlePersisted != null) {
                    finishPayload.put("battleRecordId", battlePersisted.battleRecordId());
                    finishPayload.put("winner", battlePersisted.winner());
                    finishPayload.put("durationSeconds", battlePersisted.durationSeconds());
                    finishPayload.put("redTeamKills", battlePersisted.redTeamKills());
                    finishPayload.put("blueTeamKills", battlePersisted.blueTeamKills());
                    finishPayload.put("players", battlePersisted.players());
                }
                publishRoomEvent(runtime.roomId, "BATTLE_FINISHED", finishPayload);
                Long ridEnded = runtime.roomId;
                tickScheduler.schedule(() -> disposeBattleRuntimeOnly(ridEnded), 0, TimeUnit.MILLISECONDS);
            }
        }
    }

    private void detectFighterCollisions(RoomRuntime runtime, List<FighterProbe> probes, List<Map<String, Object>> popups) {
        List<FighterProbe> reds = probes.stream().filter(f -> f.alive() && f.team() == Team.RED).toList();
        List<FighterProbe> blues = probes.stream().filter(f -> f.alive() && f.team() == Team.BLUE).toList();
        for (FighterProbe a : reds) {
            for (FighterProbe b : blues) {
                applyFighterCollisionIfNeeded(runtime, a, b, popups);
            }
        }
        applySameTeamCollisions(runtime, reds, popups);
        applySameTeamCollisions(runtime, blues, popups);
    }

    private void applySameTeamCollisions(RoomRuntime runtime, List<FighterProbe> teamMembers, List<Map<String, Object>> popups) {
        for (int i = 0; i < teamMembers.size(); i++) {
            for (int j = i + 1; j < teamMembers.size(); j++) {
                applyFighterCollisionIfNeeded(runtime, teamMembers.get(i), teamMembers.get(j), popups);
            }
        }
    }

    /** Both take 50% of own maxHp; shared cooldown keyed by fighter pair. */
    private void applyFighterCollisionIfNeeded(
        RoomRuntime runtime,
        FighterProbe a,
        FighterProbe b,
        List<Map<String, Object>> popups
    ) {
        if (!a.alive() || !b.alive()) {
            return;
        }
        if (distance(a.x(), a.y(), b.x(), b.y()) > FIGHTER_COLLISION_DIST) {
            return;
        }
        String pairKey = a.id().compareTo(b.id()) < 0 ? a.id() + "+" + b.id() : b.id() + "+" + a.id();
        long lastTick = runtime.collisionCooldowns.getOrDefault(pairKey, -100L);
        if (runtime.tick - lastTick < COLLISION_COOLDOWN_TICKS) {
            return;
        }
        runtime.collisionCooldowns.put(pairKey, runtime.tick);

        FighterRuntime fa = runtime.fighters.get(a.id());
        FighterRuntime fb = runtime.fighters.get(b.id());
        if (fa == null || fb == null) {
            return;
        }
        int dmgA = (int) (fa.maxHp * 0.5);
        int dmgB = (int) (fb.maxHp * 0.5);
        fa.hp = Math.max(0, fa.hp - dmgA);
        fb.hp = Math.max(0, fb.hp - dmgB);
        if (fa.hp == 0) {
            fa.alive = false;
        }
        if (fb.hp == 0) {
            fb.alive = false;
        }
        popups.add(Map.of("id", "col-" + pairKey, "x", fa.x, "y", fa.y, "damage", dmgA, "team", fa.team.name(), "ttlMs", 760));
        popups.add(Map.of("id", "col-" + pairKey + "b", "x", fb.x, "y", fb.y, "damage", dmgB, "team", fb.team.name(), "ttlMs", 760));
    }

    private PersistedBattleSummary saveBattleRecord(RoomRuntime runtime, BattleSnapshot snapshot) {
        if (!runtime.recordSaved.compareAndSet(false, true)) {
            return null;
        }
        try {
            BattleRecord record = new BattleRecord();
            record.setRoomId(runtime.roomId);
            record.setMode("ONLINE");
            record.setWinner(snapshot.status() == BattleStatus.RED_WIN ? "RED"
                : snapshot.status() == BattleStatus.BLUE_WIN ? "BLUE"
                : snapshot.status() == BattleStatus.DRAW ? "DRAW" : "UNKNOWN");
            record.setDurationSeconds((int) Math.max(1, (Instant.now().toEpochMilli() - runtime.startedAt) / 1000));
            record.setRedKills(maxTeamSize - snapshot.blueAlive());
            record.setBlueKills(maxTeamSize - snapshot.redAlive());
            record.setReportJson(networkProtocol.serialize(
                new NetworkMessage<>(MessageType.MSG_BATTLE_STATUS, runtime.roomId, null, snapshot.tick(),
                    Instant.now().toEpochMilli(), snapshot)
            ));

            battleRecordMapper.insert(record);
            Long battleRecordId = record.getId();
            if (battleRecordId == null) {
                log.error("battle_records insert did not return generated key (roomId={})", runtime.roomId);
                runtime.resetRecordSaved();
                return null;
            }

            List<Map<String, Object>> eventPlayers = new ArrayList<>();
            Set<Long> writtenUserIds = new HashSet<>();

            for (FighterRuntime f : runtime.fighters.values()) {
                if (f.userId == null || f.isAwacs || !writtenUserIds.add(f.userId)) {
                    continue;
                }

                User user = userMapper.findById(f.userId);
                String model = f.model != null && !f.model.isBlank() ? f.model.trim() : "UNKNOWN";
                String nickname = user != null && user.getNickname() != null ? user.getNickname().trim() : "";
                if (nickname.isEmpty()) {
                    nickname = "-";
                }
                String team = f.team.name().toUpperCase();

                BattlePlayerResult row = new BattlePlayerResult();
                row.setBattleRecordId(battleRecordId);
                row.setRoomId(runtime.roomId);
                row.setUserId(f.userId);
                row.setNickname(nickname);
                row.setTeam(team);
                row.setFighterModel(model.isEmpty() ? "UNKNOWN" : model);
                row.setKills(runtime.killsByUserId.getOrDefault(f.userId, 0));
                row.setDamageDealt(runtime.damageDealtByUserId.getOrDefault(f.userId, 0));

                Map<String, Object> evRow = new HashMap<>();
                evRow.put("userId", f.userId);
                evRow.put("nickname", nickname);
                evRow.put("team", team);
                evRow.put("fighterModel", model);
                evRow.put("kills", row.getKills());
                evRow.put("damageDealt", row.getDamageDealt());

                eventPlayers.add(evRow);

                try {
                    battlePlayerResultMapper.insert(row);
                } catch (RuntimeException ex) {
                    log.error(
                        "battle_player_results insert failed roomId={} userId={}: {}",
                        runtime.roomId,
                        f.userId,
                        ex.getMessage(),
                        ex
                    );
                }
            }

            return new PersistedBattleSummary(
                battleRecordId,
                record.getWinner(),
                record.getDurationSeconds(),
                record.getRedKills(),
                record.getBlueKills(),
                List.copyOf(eventPlayers)
            );
        } catch (RuntimeException ex) {
            log.error("saveBattleRecord failed for roomId={}", runtime.roomId, ex);
            runtime.resetRecordSaved();
            return null;
        }
    }

    private void sendCurrentSnapshot(Long roomId, WebSocketSession session) {
        RoomRuntime runtime = runtimeByRoomId.get(roomId);
        BattleSnapshot snapshot = runtime == null ? new BattleSnapshot(
            String.valueOf(roomId),
            0L,
            BattleStatus.WAITING,
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            0,
            0,
            0L
        ) : toSnapshot(runtime);
        send(session, new NetworkMessage<>(MessageType.MSG_BATTLE_STATUS, roomId, null, snapshot.tick(), Instant.now().toEpochMilli(), snapshot));
    }

    private RoomRuntime initRuntime(Long roomId) {
        requireRoom(roomId);
        RoomRuntime runtime = new RoomRuntime(roomId);
        runtime.status = BattleStatus.RUNNING;
        runtime.startedAt = Instant.now().toEpochMilli();

        Map<Long, String> roomModels = playerModelByRoomId.getOrDefault(roomId, Map.of());

        List<RoomPlayer> players = roomPlayerMapper.findByRoomId(roomId);
        int redSlot = 0;
        int blueSlot = 0;
        for (RoomPlayer player : players) {
            Team team = Team.valueOf(player.getTeam());
            int slot = team == Team.RED ? redSlot++ : blueSlot++;
            String selectedModel = roomModels.getOrDefault(player.getUserId(), team == Team.RED ? "J-20" : "J-16");
            FighterRuntime fighter = createFighter(team, slot, player.getUserId(), resolveFighterId(player), selectedModel);
            runtime.fighters.put(fighter.id, fighter);
            runtime.userFighterId.put(player.getUserId(), fighter.id);
        }
        while (redSlot < maxTeamSize) {
            String model = AI_MODELS[RAND.nextInt(AI_MODELS.length)];
            FighterRuntime ai = createFighter(Team.RED, redSlot, null, "ai-red-" + redSlot, model);
            runtime.fighters.put(ai.id, ai);
            redSlot++;
        }
        while (blueSlot < maxTeamSize) {
            String model = AI_MODELS[RAND.nextInt(AI_MODELS.length)];
            FighterRuntime ai = createFighter(Team.BLUE, blueSlot, null, "ai-blue-" + blueSlot, model);
            runtime.fighters.put(ai.id, ai);
            blueSlot++;
        }

        // AWACS for RED side (stay within left ~1/5 band)
        FighterRuntime redAwacs = new FighterRuntime(
            "RED-AWACS-1", null, Team.RED, randomSpawnX(Team.RED), randomAwacsY()
        );
        redAwacs.model = "KJ-500";
        redAwacs.hp = 260;
        redAwacs.maxHp = 260;
        redAwacs.missileCount = 0;
        redAwacs.bombCount = 0;
        redAwacs.isAwacs = true;
        redAwacs.catalogSpeed = 150;
        redAwacs.aiNoseHeading = 0;
        runtime.fighters.put(redAwacs.id, redAwacs);

        // AWACS for BLUE side (stay within right ~1/5 band)
        FighterRuntime blueAwacs = new FighterRuntime(
            "BLUE-AWACS-1", null, Team.BLUE, randomSpawnX(Team.BLUE), randomAwacsY()
        );
        blueAwacs.model = "KJ-500";
        blueAwacs.hp = 260;
        blueAwacs.maxHp = 260;
        blueAwacs.missileCount = 0;
        blueAwacs.bombCount = 0;
        blueAwacs.isAwacs = true;
        blueAwacs.catalogSpeed = 150;
        blueAwacs.aiNoseHeading = Math.PI;
        runtime.fighters.put(blueAwacs.id, blueAwacs);

        roomMapper.updateStatus(roomId, "RUNNING");
        return runtime;
    }

    private String resolveFighterId(RoomPlayer player) {
        if (player.getFighterId() != null && !player.getFighterId().isBlank()) {
            return player.getFighterId();
        }
        return player.getTeam().toLowerCase() + "-" + player.getUserId();
    }

    private FighterRuntime createFighter(Team team, int slot, Long userId, String id, String model) {
        double x = randomSpawnX(team);
        double y = jitteredLaneY(slot);
        FighterRuntime fighter = new FighterRuntime(id, userId, team, x, y);
        fighter.model = model;
        ModelStats stats = MODEL_STATS.getOrDefault(model, MODEL_STATS.get("J-20"));
        fighter.hp = stats.hp();
        fighter.maxHp = stats.hp();
        fighter.missileCount = stats.missiles();
        fighter.bombCount = stats.bombs();
        fighter.catalogSpeed = stats.catalogSpeed();
        fighter.movePixelsPerTick = stats.pixelsPerTick();
        fighter.heading = team == Team.RED ? 0 : Math.PI;
        fighter.aiNoseHeading = fighter.heading;
        if (team == Team.BLUE && userId == null) {
            fighter.hp = Math.max(20, (int) Math.floor(fighter.hp * BLUE_AI_STAT_FACTOR));
            fighter.maxHp = fighter.hp;
            fighter.missileCount = Math.max(1, (int) Math.floor(fighter.missileCount * BLUE_AI_STAT_FACTOR));
            fighter.bombCount = Math.max(0, (int) Math.floor(fighter.bombCount * BLUE_AI_STAT_FACTOR));
        }
        return fighter;
    }

    private InputCommand createAiInput(List<FighterProbe> fighters, FighterProbe self) {
        FighterProbe target = findClosestEnemy(fighters, self.team(), self.x(), self.y());
        if (target == null) {
            return new InputCommand(0, 0, false, false, null, null, null);
        }
        double dx = target.x() - self.x();
        double dy = target.y() - self.y();
        double dist = distance(self.x(), self.y(), target.x(), target.y());
        double headingToEnemy = Math.atan2(dy, dx);

        double sideSign = self.id().hashCode() % 2 == 0 ? 1.0 : -1.0;
        double tanWeight = 0.26 + RAND.nextDouble() * 0.16;
        double navX = Math.cos(headingToEnemy) * (1 - tanWeight)
            + Math.cos(headingToEnemy + sideSign * Math.PI / 2) * tanWeight;
        double navY = Math.sin(headingToEnemy) * (1 - tanWeight)
            + Math.sin(headingToEnemy + sideSign * Math.PI / 2) * tanWeight;
        double navHeading = Math.atan2(navY, navX);

        boolean slowApproach = dist <= 220 && RAND.nextDouble() < 0.5;
        int moveX = 0;
        int moveY = 0;
        if (!slowApproach) {
            double vx = Math.cos(navHeading);
            double vy = Math.sin(navHeading);
            moveX = vx > 0.35 ? 1 : (vx < -0.35 ? -1 : 0);
            moveY = vy > 0.35 ? 1 : (vy < -0.35 ? -1 : 0);
            if (moveX == 0 && moveY == 0) {
                moveX = vx >= 0 ? 1 : -1;
            }
        }

        // SimpleAI parity: gated by ai nose (probe heading), scaled to server tick rate
        double headingDiff = wrapAngleDiff(headingToEnemy, self.heading());
        double missileFireChance = 0.015 * (60.0 / tickRate);
        boolean aimAligned = Math.abs(headingDiff) < 0.35;
        boolean fire = dist < 260 && self.missileCount() > 0 && aimAligned && RAND.nextDouble() < missileFireChance;
        boolean fireBomb = !fire && dist < 200 && self.bombCount() > 0
            && aimAligned && RAND.nextDouble() < missileFireChance * 1.5;

        return new InputCommand(moveX, moveY, fire, fireBomb, target.id(),
            fire ? headingToEnemy : null, fireBomb ? headingToEnemy : null);
    }

    private void applyMove(FighterRuntime fighter, InputCommand command) {
        double step = fighter.movePixelsPerTick;
        fighter.x = clamp(fighter.x + command.moveX() * step, 50, WORLD_WIDTH - 50);
        fighter.y = clamp(fighter.y + command.moveY() * step, 50, WORLD_HEIGHT - 50);
        if (command.moveX() != 0 || command.moveY() != 0) {
            fighter.heading = Math.atan2(command.moveY(), command.moveX());
        }
    }

    private double awacsEffectiveRadarRange(FighterRuntime awacs) {
        if (awacs == null || !awacs.alive || !awacs.isAwacs || awacs.maxHp <= 0) {
            return 0.0;
        }
        return ONLINE_RADAR_RANGE * awacs.hp / awacs.maxHp;
    }

    private boolean isEnemyCoveredByFriendlyAwacs(RoomRuntime runtime, Team friendlyTeam, FighterRuntime enemy) {
        if (enemy == null || !enemy.alive || enemy.team == friendlyTeam) {
            return false;
        }
        for (FighterRuntime f : runtime.fighters.values()) {
            if (!f.alive || !f.isAwacs || f.team != friendlyTeam) {
                continue;
            }
            double range = awacsEffectiveRadarRange(f);
            if (range > 0 && distance(f.x, f.y, enemy.x, enemy.y) <= range) {
                return true;
            }
        }
        return false;
    }

    private void steerMissile(RoomRuntime runtime, MissileRuntime missile) {
        if (!missile.homingActive || missile.trackedTargetId == null) {
            return;
        }
        FighterRuntime tgt = runtime.fighters.get(missile.trackedTargetId);
        if (tgt == null || !tgt.alive || tgt.team == missile.team) {
            missile.homingActive = false;
            return;
        }
        if (!isEnemyCoveredByFriendlyAwacs(runtime, missile.team, tgt)) {
            missile.homingActive = false;
            return;
        }
        double desired = Math.atan2(tgt.y - missile.y, tgt.x - missile.x);
        double diff = wrapAngleDiff(desired, missile.heading);
        double maxTurn = MISSILE_MAX_TURN_RAD_PER_SEC * (tickMillis / 1000.0);
        missile.heading += clamp(diff, -maxTurn, maxTurn);
    }

    private MissileRuntime createMissile(RoomRuntime runtime, FighterRuntime fighter, String targetId, Double fireHeading) {
        FighterRuntime resolvedTarget = targetId == null
            ? findClosestEnemy(runtime, fighter.team, fighter.x, fighter.y)
            : runtime.fighters.get(targetId);
        if (resolvedTarget != null && (!resolvedTarget.alive || resolvedTarget.team == fighter.team)) {
            resolvedTarget = null;
        }
        double heading;
        if (fireHeading != null) {
            heading = fireHeading;
        } else {
            heading = resolvedTarget == null ? fighter.heading : Math.atan2(resolvedTarget.y - fighter.y, resolvedTarget.x - fighter.x);
        }
        boolean homing = resolvedTarget != null && isEnemyCoveredByFriendlyAwacs(runtime, fighter.team, resolvedTarget);
        String trackedId = resolvedTarget != null ? resolvedTarget.id : null;
        String missileId = "msl-" + runtime.roomId + "-" + runtime.tick + "-" + fighter.id;
        return new MissileRuntime(
            missileId,
            fighter.team,
            fighter.x,
            fighter.y,
            heading,
            missileDamageForShooter(fighter),
            fighter.id,
            trackedId,
            homing
        );
    }

    private BombRuntime createBomb(RoomRuntime runtime, FighterRuntime fighter, double heading) {
        String bombId = "bmb-" + runtime.roomId + "-" + runtime.tick + "-" + fighter.id;
        ModelStats stats = MODEL_STATS.getOrDefault(fighter.model, MODEL_STATS.get("J-20"));
        double blastRadius = stats.bombRadius();
        int blastDamage = stats.bombDamage();
        if (fighter.team == Team.BLUE && fighter.userId == null) {
            blastRadius = Math.max(40.0, Math.floor(blastRadius * BLUE_AI_STAT_FACTOR));
            blastDamage = Math.max(10, (int) Math.floor(blastDamage * BLUE_AI_STAT_FACTOR));
        }
        return new BombRuntime(bombId, fighter.team, fighter.x, fighter.y, heading, blastRadius, blastDamage, fighter.id);
    }

    private FighterRuntime findClosestEnemy(RoomRuntime runtime, Team ownTeam, double x, double y) {
        return runtime.fighters.values().stream()
            .filter(fighter -> fighter.alive && fighter.team != ownTeam)
            .min(Comparator.comparingDouble(fighter -> distance(x, y, fighter.x, fighter.y)))
            .orElse(null);
    }

    private FighterProbe findClosestEnemy(List<FighterProbe> fighters, Team ownTeam, double x, double y) {
        return fighters.stream()
            .filter(fighter -> fighter.alive() && fighter.team() != ownTeam)
            .min(Comparator.comparingDouble(fighter -> distance(x, y, fighter.x(), fighter.y())))
            .orElse(null);
    }

    private Map<String, InputCommand> buildAiCommands(List<FighterProbe> fighters, Set<Long> onlineUsers) {
        Map<String, InputCommand> commands = new HashMap<>();
        for (FighterProbe fighter : fighters) {
            if (!fighter.alive() || fighter.isAwacs()) {
                continue;
            }
            boolean playerOnline = fighter.userId() != null && onlineUsers.contains(fighter.userId());
            if (playerOnline) {
                continue;
            }
            commands.put(fighter.id(), createAiInput(fighters, fighter));
        }
        return commands;
    }

    private List<HitCandidate> detectHits(List<FighterProbe> fighters, List<MissileProbe> missiles) {
        List<HitCandidate> hits = new ArrayList<>();
        for (MissileProbe missile : missiles) {
            if (!missile.alive()) {
                continue;
            }
            FighterProbe target = findClosestEnemy(fighters, missile.team(), missile.x(), missile.y());
            if (target == null) {
                continue;
            }
            if (distance(missile.x(), missile.y(), target.x(), target.y()) <= 22) {
                hits.add(new HitCandidate(missile.id(), target.id(), missile.damage()));
            }
        }
        return hits;
    }

    private List<RadarMark> scanRadarMarks(List<FighterProbe> fighters) {
        List<RadarMark> marks = new ArrayList<>();
        Set<String> detectedTargets = ConcurrentHashMap.newKeySet();
        // Only AWACS units contribute radar detection
        for (FighterProbe observer : fighters) {
            if (!observer.alive() || !observer.isAwacs()) {
                continue;
            }
            for (FighterProbe target : fighters) {
                if (!target.alive() || target.team() == observer.team() || detectedTargets.contains(target.id())) {
                    continue;
                }
                double d = distance(observer.x(), observer.y(), target.x(), target.y());
                double effRange = observer.isAwacs() && observer.maxHp() > 0
                    ? ONLINE_RADAR_RANGE * observer.hp() / (double) observer.maxHp()
                    : 0.0;
                if (effRange <= 0 || d > effRange) {
                    continue;
                }
                detectedTargets.add(target.id());
                marks.add(new RadarMark(
                    target.id(),
                    new Vector2(target.x(), target.y()),
                    target.team(),
                    d,
                    true
                ));
            }
        }
        return marks;
    }

    private void stepAiNoseForAiFighters(RoomRuntime runtime, Set<Long> onlineUsers) {
        for (FighterRuntime f : runtime.fighters.values()) {
            if (!f.alive || f.isAwacs) {
                continue;
            }
            boolean isPlayer = f.userId != null && onlineUsers.contains(f.userId);
            if (isPlayer) {
                f.aiNoseHeading = f.heading;
                continue;
            }
            FighterRuntime target = findClosestEnemy(runtime, f.team, f.x, f.y);
            if (target == null) {
                continue;
            }
            double toEnemy = Math.atan2(target.y - f.y, target.x - f.x);
            double sideSign = f.id.hashCode() % 2 == 0 ? 1.0 : -1.0;
            double tangentialWeight = 0.26 + RAND.nextDouble() * 0.14;
            double nx = Math.cos(toEnemy) * (1 - tangentialWeight)
                + Math.cos(toEnemy + sideSign * Math.PI / 2) * tangentialWeight;
            double ny = Math.sin(toEnemy) * (1 - tangentialWeight)
                + Math.sin(toEnemy + sideSign * Math.PI / 2) * tangentialWeight;
            double desiredNose = Math.atan2(ny, nx);
            double diff = wrapAngleDiff(desiredNose, f.aiNoseHeading);
            f.aiNoseHeading += clamp(diff, -0.11, 0.11);
            f.aiNoseHeading += Math.sin(runtime.tick * 0.085 + Math.abs(f.id.hashCode() % 17)) * 0.08;
        }
    }

    private void creditPlayerCombat(RoomRuntime runtime, String ownerFighterId, FighterRuntime victim, int damage, boolean victimWasAliveBeforeHit) {
        if (damage <= 0 || ownerFighterId == null) {
            return;
        }
        FighterRuntime owner = runtime.fighters.get(ownerFighterId);
        if (owner == null || owner.userId == null) {
            return;
        }
        runtime.damageDealtByUserId.merge(owner.userId, damage, (a, b) ->
            (a == null ? 0 : a) + (b == null ? 0 : b));
        if (victimWasAliveBeforeHit && !victim.alive && !victim.isAwacs) {
            runtime.killsByUserId.merge(owner.userId, 1, (a, b) ->
                (a == null ? 0 : a) + (b == null ? 0 : b));
        }
    }

    private static double probeHeadingFor(FighterRuntime fighter, Set<Long> onlineUsers) {
        if (fighter.isAwacs) {
            return fighter.heading;
        }
        boolean isPlayer = fighter.userId != null && onlineUsers.contains(fighter.userId);
        return isPlayer ? fighter.heading : fighter.aiNoseHeading;
    }

    private List<FighterProbe> copyFighterProbes(Iterable<FighterRuntime> fighters, Set<Long> onlineUsers) {
        List<FighterProbe> copies = new ArrayList<>();
        for (FighterRuntime fighter : fighters) {
            double probeHeading = probeHeadingFor(fighter, onlineUsers);
            copies.add(new FighterProbe(
                fighter.id,
                fighter.userId,
                fighter.team,
                fighter.x,
                fighter.y,
                fighter.hp,
                fighter.maxHp,
                fighter.missileCount,
                fighter.bombCount,
                fighter.alive,
                fighter.isAwacs,
                probeHeading
            ));
        }
        return copies;
    }

    private List<MissileProbe> copyMissileProbes(Iterable<MissileRuntime> missiles) {
        List<MissileProbe> copies = new ArrayList<>();
        for (MissileRuntime missile : missiles) {
            copies.add(new MissileProbe(
                missile.id,
                missile.team,
                missile.x,
                missile.y,
                missile.alive,
                missile.damage
            ));
        }
        return copies;
    }

    private BattleSnapshot toSnapshot(RoomRuntime runtime) {
        List<FighterState> fighters = runtime.fighters.values().stream()
            .map(this::toFighterState)
            .toList();
        List<MissileState> missiles = runtime.missiles.values().stream()
            .map(this::toMissileState)
            .toList();
        List<BombState> bombs = runtime.bombs.values().stream()
            .filter(b -> b.alive)
            .map(this::toBombState)
            .toList();

        int redAlive = (int) runtime.fighters.values().stream()
            .filter(f -> f.team == Team.RED && f.alive && !f.isAwacs).count();
        int blueAlive = (int) runtime.fighters.values().stream()
            .filter(f -> f.team == Team.BLUE && f.alive && !f.isAwacs).count();

        BattleStatus status = runtime.status;
        if (status == BattleStatus.RUNNING) {
            if (redAlive == 0 && blueAlive == 0) {
                status = BattleStatus.DRAW;
            } else if (redAlive == 0) {
                status = BattleStatus.BLUE_WIN;
            } else if (blueAlive == 0) {
                status = BattleStatus.RED_WIN;
            }
        }

        long elapsedMs = runtime.startedAt > 0
            ? Instant.now().toEpochMilli() - runtime.startedAt
            : 0L;

        return new BattleSnapshot(
            String.valueOf(runtime.roomId),
            runtime.tick,
            status,
            fighters,
            missiles,
            bombs,
            runtime.radarMarks,
            runtime.damagePopups,
            redAlive,
            blueAlive,
            elapsedMs
        );
    }

    private FighterState toFighterState(FighterRuntime fighter) {
        String nickname = fighter.userId != null ? nicknameByUserId.get(fighter.userId) : null;
        return new FighterState(
            fighter.id,
            fighter.team,
            fighter.model,
            new Vector2(fighter.x, fighter.y),
            fighter.heading,
            fighter.catalogSpeed,
            fighter.hp,
            fighter.maxHp,
            fighter.missileCount,
            fighter.bombCount,
            fighter.alive,
            fighter.controlType,
            nickname
        );
    }

    private MissileState toMissileState(MissileRuntime missile) {
        return new MissileState(
            missile.id,
            missile.team,
            new Vector2(missile.x, missile.y),
            missile.heading,
            14.0,
            missile.trackedTargetId,
            missile.alive,
            missile.ttlMs,
            missile.damage
        );
    }

    private BombState toBombState(BombRuntime bomb) {
        return new BombState(
            bomb.id,
            bomb.team,
            new Vector2(bomb.x, bomb.y),
            bomb.heading,
            bomb.alive,
            bomb.ttlMs,
            bomb.blastRadius,
            bomb.blastDamage
        );
    }

    private void broadcastSnapshot(RoomRuntime runtime) {
        BattleSnapshot snapshot = toSnapshot(runtime);
        broadcast(
            runtime.roomId,
            new NetworkMessage<>(MessageType.MSG_BATTLE_STATUS, runtime.roomId, null, runtime.tick, Instant.now().toEpochMilli(), snapshot)
        );
    }

    private void publishRoomEvent(Long roomId, String event, Object payload) {
        broadcast(roomId, new NetworkMessage<>(MessageType.MSG_ROOM_EVENT, roomId, null, null, Instant.now().toEpochMilli(), Map.of(
            "event", event,
            "payload", payload
        )));
    }

    private void sendError(Long roomId, String message) {
        broadcast(roomId, new NetworkMessage<>(MessageType.MSG_ERROR, roomId, null, null, Instant.now().toEpochMilli(), Map.of(
            "message", message
        )));
    }

    private void broadcast(Long roomId, NetworkMessage<?> message) {
        String raw = networkProtocol.serialize(message);
        for (WebSocketSession session : sessionsByRoomId.getOrDefault(roomId, Set.of())) {
            if (!session.isOpen()) {
                continue;
            }
            sendRaw(session, raw);
        }
    }

    private void send(WebSocketSession session, NetworkMessage<?> message) {
        sendRaw(session, networkProtocol.serialize(message));
    }

    private void sendRaw(WebSocketSession session, String raw) {
        try {
            synchronized (session) {
                session.sendMessage(new TextMessage(Objects.requireNonNull(raw)));
            }
        } catch (IOException ignored) {
        }
    }

    private void disposeBattleRuntimeOnly(Long roomId) {
        runtimeByRoomId.remove(roomId);
    }

    /**
     * Full teardown (stale/expired rooms). Do not call after normal battle end —
     * that path uses {@link #disposeBattleRuntimeOnly} so lobby WebSockets stay routed.
     */
    private void cleanupRoomMemory(Long roomId) {
        runtimeByRoomId.remove(roomId);
        sessionsByRoomId.remove(roomId);
        onlineUsersByRoomId.remove(roomId);
        playerModelByRoomId.remove(roomId);
    }

    private void expireStaleRooms() {
        try {
            List<Long> stale = roomMapper.findStaleActiveRoomIds();
            for (Long roomId : stale) {
                roomMapper.updateStatus(roomId, "EXPIRED");
                disbandRoom(roomId, "STALE_TIMEOUT");
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * 关闭房间全部 WebSocket、移除内存战场；与超时解散共用。
     *
     * @param expireReason 写入 ROOM_EXPIRED 事件 payload，供客户端区分文案
     */
    public void disbandRoom(Long roomId, String expireReason) {
        try {
            publishRoomEvent(roomId, "ROOM_EXPIRED", Map.of("roomId", roomId, "reason", expireReason != null ? expireReason : ""));
        } catch (Exception ignored) {
            // ignore
        }
        Set<WebSocketSession> bucket = sessionsByRoomId.get(roomId);
        if (bucket != null) {
            for (WebSocketSession session : List.copyOf(bucket)) {
                try {
                    if (session.isOpen()) {
                        session.close(Objects.requireNonNull(CloseStatus.GOING_AWAY));
                    }
                } catch (IOException ignored) {
                    // ignore
                }
            }
        }
        cleanupRoomMemory(roomId);
    }

    private double randomSpawnX(Team team) {
        double margin = 50.0;
        if (team == Team.RED) {
            double maxX = WORLD_WIDTH / 5.0 - margin;
            return margin + RAND.nextDouble() * Math.max(1e-6, maxX - margin);
        }
        double minX = WORLD_WIDTH * 4.0 / 5.0 + margin;
        double maxX = WORLD_WIDTH - margin;
        return minX + RAND.nextDouble() * Math.max(1e-6, maxX - minX);
    }

    private double jitteredLaneY(int slot) {
        double baseY = 900.0 + slot * 220.0;
        double jitter = (RAND.nextDouble() - 0.5) * 100.0;
        return clamp(baseY + jitter, 50.0, WORLD_HEIGHT - 50.0);
    }

    private double randomAwacsY() {
        return clamp(900.0 + RAND.nextDouble() * 540.0, 50.0, WORLD_HEIGHT - 50.0);
    }

    private Room requireRoom(Long roomId) {
        Room room = roomMapper.findById(roomId);
        if (room == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "房间不存在");
        }
        return room;
    }

    private static double distance(double x1, double y1, double x2, double y2) {
        return Math.hypot(x1 - x2, y1 - y2);
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double wrapAngleDiff(double targetHeading, double currentHeading) {
        return Math.atan2(Math.sin(targetHeading - currentHeading), Math.cos(targetHeading - currentHeading));
    }

    private int missileDamageForShooter(FighterRuntime fighter) {
        ModelStats stats = MODEL_STATS.getOrDefault(fighter.model, MODEL_STATS.get("J-20"));
        int d = stats.missileDamage();
        if (fighter.team == Team.BLUE && fighter.userId == null) {
            return Math.max(1, (int) Math.floor(d * BLUE_AI_STAT_FACTOR));
        }
        return d;
    }

    public record ConnectionContext(String sessionId, Long roomId, Long userId, long sessionAuthRevision) {
    }

    private record PersistedBattleSummary(
        Long battleRecordId,
        String winner,
        Integer durationSeconds,
        Integer redTeamKills,
        Integer blueTeamKills,
        List<Map<String, Object>> players
    ) {
    }

    /**
     * Preserves a missile/bomb tap when {@link #latestInputs} is overwritten by a later message with {@code fire=false}
     * before the next tick consumes it.
     */
    private record PendingMissileIntent(Double fireHeading, String targetId) {
    }

    private record PendingBombIntent(Double fireBombHeading) {
    }

    private static final class RoomRuntime {
        private final Long roomId;
        private volatile BattleStatus status = BattleStatus.WAITING;
        private long tick = 0L;
        private long startedAt = 0L;
        private final AtomicBoolean recordSaved = new AtomicBoolean(false);
        private final Map<String, FighterRuntime> fighters = new ConcurrentHashMap<>();
        private final Map<String, MissileRuntime> missiles = new ConcurrentHashMap<>();
        private final Map<String, BombRuntime> bombs = new ConcurrentHashMap<>();
        private final Map<Long, String> userFighterId = new ConcurrentHashMap<>();
        private final Map<String, InputCommand> latestInputs = new ConcurrentHashMap<>();
        private final Map<String, PendingMissileIntent> pendingMissileByFighter = new ConcurrentHashMap<>();
        private final Map<String, PendingBombIntent> pendingBombByFighter = new ConcurrentHashMap<>();
        private final Map<String, Long> collisionCooldowns = new ConcurrentHashMap<>();
        private volatile List<RadarMark> radarMarks = List.of();
        private volatile List<Map<String, Object>> damagePopups = List.of();
        private final Map<Long, Integer> damageDealtByUserId = new ConcurrentHashMap<>();
        private final Map<Long, Integer> killsByUserId = new ConcurrentHashMap<>();

        private RoomRuntime(Long roomId) {
            this.roomId = roomId;
        }

        /** Same package: allow undoing compareAndSet after a failed persistence attempt. */
        void resetRecordSaved() {
            recordSaved.set(false);
        }
    }

    private static final class FighterRuntime {
        private final String id;
        private final Long userId;
        private final Team team;
        private double x;
        private double y;
        private double heading = 0;
        private int hp = 100;
        private int maxHp = 100;
        private int missileCount = 6;
        private int bombCount = 4;
        private boolean alive = true;
        private boolean isAwacs = false;
        private String model = "J-20";
        private ControlType controlType = ControlType.AI;
        private double catalogSpeed = 180;
        private double movePixelsPerTick = BASELINE_MOVE_PX_PER_TICK;
        /** AI aiming / SimpleAI-parity gating; synced from player heading for humans */
        private double aiNoseHeading = 0;

        private FighterRuntime(String id, Long userId, Team team, double x, double y) {
            this.id = id;
            this.userId = userId;
            this.team = team;
            this.x = x;
            this.y = y;
        }
    }

    private static final class MissileRuntime {
        private final String id;
        private final Team team;
        private double x;
        private double y;
        private double heading;
        private final int damage;
        private final String ownerFighterId;
        private boolean alive = true;
        private long ttlMs = 3500;
        private final String trackedTargetId;
        private boolean homingActive;

        private MissileRuntime(
            String id,
            Team team,
            double x,
            double y,
            double heading,
            int damage,
            String ownerFighterId,
            String trackedTargetId,
            boolean homingActive
        ) {
            this.id = id;
            this.team = team;
            this.x = x;
            this.y = y;
            this.heading = heading;
            this.damage = damage;
            this.ownerFighterId = ownerFighterId;
            this.trackedTargetId = trackedTargetId;
            this.homingActive = homingActive;
        }
    }

    private static final class BombRuntime {
        private final String id;
        private final Team team;
        private double x;
        private double y;
        private double heading;
        private boolean alive = true;
        private long ttlMs;
        private double blastRadius;
        private int blastDamage;
        private final String ownerFighterId;

        private BombRuntime(String id, Team team, double x, double y, double heading, double blastRadius, int blastDamage, String ownerFighterId) {
            this.id = id;
            this.team = team;
            this.x = x;
            this.y = y;
            this.heading = heading;
            this.ttlMs = BOMB_TTL_MS;
            this.blastRadius = blastRadius;
            this.blastDamage = blastDamage;
            this.ownerFighterId = ownerFighterId;
        }
    }

    private record FighterProbe(
        String id,
        Long userId,
        Team team,
        double x,
        double y,
        int hp,
        int maxHp,
        int missileCount,
        int bombCount,
        boolean alive,
        boolean isAwacs,
        double heading
    ) {
    }

    private record MissileProbe(
        String id,
        Team team,
        double x,
        double y,
        boolean alive,
        int damage
    ) {
    }

    private record HitCandidate(String missileId, String fighterId, int damage) {
    }
}
