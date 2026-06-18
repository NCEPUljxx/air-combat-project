package com.aircombat.game;

public interface INetworkProtocol {

    String serialize(NetworkMessage<?> message);

    NetworkMessage<?> deserialize(String raw);

    MessageType getMessageType(String raw);
}
