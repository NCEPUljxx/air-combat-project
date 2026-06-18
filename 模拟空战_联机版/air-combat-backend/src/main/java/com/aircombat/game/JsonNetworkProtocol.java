package com.aircombat.game;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public class JsonNetworkProtocol implements INetworkProtocol {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String serialize(NetworkMessage<?> message) {
        try {
            return objectMapper.writeValueAsString(message);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("消息序列化失败", exception);
        }
    }

    @Override
    public NetworkMessage<?> deserialize(String raw) {
        try {
            return objectMapper.readValue(raw, objectMapper.getTypeFactory().constructParametricType(NetworkMessage.class, Object.class));
        } catch (Exception exception) {
            throw new IllegalArgumentException("消息反序列化失败", exception);
        }
    }

    @Override
    public MessageType getMessageType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("空消息");
        }
        try {
            JsonNode node = objectMapper.readTree(raw);
            JsonNode typeNode = node.get("type");
            if (typeNode == null || typeNode.asText().isBlank()) {
                throw new IllegalArgumentException("消息缺少 type");
            }
            return MessageType.valueOf(typeNode.asText());
        } catch (Exception exception) {
            throw new IllegalArgumentException("无法识别消息类型", exception);
        }
    }
}
