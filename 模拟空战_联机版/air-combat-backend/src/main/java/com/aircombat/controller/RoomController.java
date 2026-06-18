package com.aircombat.controller;

import com.aircombat.dto.request.CreateRoomRequest;
import com.aircombat.dto.request.JoinRoomRequest;
import com.aircombat.dto.request.SelectTeamRequest;
import com.aircombat.dto.response.LastBattleSummaryResponse;
import com.aircombat.dto.response.RoomResponse;
import com.aircombat.service.OnlineGameService;
import com.aircombat.service.RoomService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;

import java.util.List;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private static final String TOKEN_HEADER = "X-Token";

    private final RoomService roomService;
    private final OnlineGameService onlineGameService;

    public RoomController(RoomService roomService, OnlineGameService onlineGameService) {
        this.roomService = roomService;
        this.onlineGameService = onlineGameService;
    }

    @GetMapping
    public List<RoomResponse> listRooms() {
        return roomService.listRooms();
    }

    @GetMapping("/{roomId}")
    public RoomResponse getRoom(@PathVariable Long roomId) {
        return roomService.getRoom(roomId);
    }

    @GetMapping("/{roomId}/last-battle-summary")
    public LastBattleSummaryResponse getLastBattleSummary(
        @RequestHeader(TOKEN_HEADER) String token,
        @PathVariable Long roomId
    ) {
        return roomService.getLastBattleSummary(token, roomId);
    }

    @GetMapping("/{roomId}/battle-history")
    public List<LastBattleSummaryResponse> getBattleHistory(
        @RequestHeader(TOKEN_HEADER) String token,
        @PathVariable Long roomId
    ) {
        return roomService.getBattleHistory(token, roomId);
    }

    @PostMapping
    public RoomResponse createRoom(
        @RequestHeader(TOKEN_HEADER) String token,
        @RequestBody CreateRoomRequest request
    ) {
        return roomService.createRoom(token, request.name());
    }

    @PostMapping("/{roomId}/join")
    public RoomResponse joinRoom(
        @RequestHeader(TOKEN_HEADER) String token,
        @PathVariable Long roomId,
        @RequestBody JoinRoomRequest request
    ) {
        return roomService.joinRoom(token, roomId, request.team());
    }

    @PostMapping("/{roomId}/team")
    public RoomResponse selectTeam(
        @RequestHeader(TOKEN_HEADER) String token,
        @PathVariable Long roomId,
        @RequestBody SelectTeamRequest request
    ) {
        return roomService.selectTeam(token, roomId, request.team());
    }

    @PostMapping("/{roomId}/leave")
    public RoomResponse leaveRoom(
        @RequestHeader(TOKEN_HEADER) String token,
        @PathVariable Long roomId
    ) {
        return roomService.leaveRoom(token, roomId);
    }

    @PostMapping("/{roomId}/start")
    public RoomResponse startRoom(
        @RequestHeader(TOKEN_HEADER) String token,
        @PathVariable Long roomId
    ) {
        RoomResponse response = roomService.startRoom(token, roomId);
        onlineGameService.announceCountdownAndScheduleBattle(roomId);
        return response;
    }

    @PutMapping("/{roomId}/model")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void selectModel(
        @RequestHeader(TOKEN_HEADER) String token,
        @PathVariable Long roomId,
        @RequestBody SelectModelRequest request
    ) {
        onlineGameService.selectPlayerModel(token, roomId, request.model());
    }

    public record SelectModelRequest(String model) {}
}
