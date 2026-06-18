import type { INetworkProtocol } from './interfaces'
import type { MessageType, NetworkMessage } from './types'

export class JsonNetworkProtocol<T = unknown> implements INetworkProtocol<T> {
  serialize(message: NetworkMessage<T>): string {
    return JSON.stringify(message)
  }

  deserialize(raw: string): NetworkMessage<T> {
    return JSON.parse(raw) as NetworkMessage<T>
  }

  getMessageType(raw: string): MessageType {
    return this.deserialize(raw).type
  }
}
