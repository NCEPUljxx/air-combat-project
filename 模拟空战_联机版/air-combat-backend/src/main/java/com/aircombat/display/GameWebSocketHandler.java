package com.aircombat.display;

import java.net.URI;

import com.aircombat.service.OnlineGameService;
import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class GameWebSocketHandler extends TextWebSocketHandler {

    private final OnlineGameService onlineGameService;

    public GameWebSocketHandler(@NonNull OnlineGameService onlineGameService) {
        this.onlineGameService = onlineGameService;
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) {
        Long roomId = resolveRoomId(session);
        String token = resolveToken(session);
        onlineGameService.connect(session, token, roomId);
    }

    @Override
    protected void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage message) {
        onlineGameService.handleClientMessage(session, message.getPayload());
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus status) {
        onlineGameService.disconnect(session.getId());
    }

    private String resolveToken(WebSocketSession session) {
        MultiValueMap<String, String> params = queryParams(session);
        String token = params.getFirst("token");
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "缺少 token");
        }
        return token;
    }

    private Long resolveRoomId(WebSocketSession session) {
        MultiValueMap<String, String> params = queryParams(session);
        String roomId = params.getFirst("roomId");
        if (roomId == null || roomId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "缺少 roomId");
        }
        try {
            return Long.valueOf(roomId);
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "roomId 非法");
        }
    }

    private MultiValueMap<String, String> queryParams(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "WebSocket URI 无效");
        }
        return UriComponentsBuilder.fromUri(uri).build().getQueryParams();
    }
}
