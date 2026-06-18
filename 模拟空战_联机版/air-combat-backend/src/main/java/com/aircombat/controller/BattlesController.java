package com.aircombat.controller;

import com.aircombat.dto.response.LastBattleSummaryResponse;
import com.aircombat.service.RoomService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/battles")
public class BattlesController {

    private static final String TOKEN_HEADER = "X-Token";

    private final RoomService roomService;

    public BattlesController(RoomService roomService) {
        this.roomService = roomService;
    }

    /** Current user's ONLINE battle history across rooms (from battle_player_results join). */
    @GetMapping("/my-history")
    public List<LastBattleSummaryResponse> getMyBattleHistory(
        @RequestHeader(TOKEN_HEADER) String token,
        @RequestParam(name = "limit", defaultValue = "50") int limit
    ) {
        return roomService.getMyBattleHistory(token, limit);
    }

    @GetMapping("/global-history")
    public List<LastBattleSummaryResponse> getGlobalOnlineBattleHistory(
        @RequestHeader(TOKEN_HEADER) String token,
        @RequestParam(name = "limit", defaultValue = "80") int limit
    ) {
        return roomService.getGlobalOnlineBattleHistory(token, limit);
    }
}
