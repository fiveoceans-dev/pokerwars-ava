import { EventEmitter } from "events";
import type { ServerEvent, ClientCommand } from "./networking";

/**
 * Simple event bus broadcasting server events to listeners and queuing
 * validated client commands for server processing.
 */
export class EventBus {
  private emitter = new EventEmitter();
  private commandQueue: ClientCommand[] = [];

  /** Emit a server event to all listeners */
  emit(event: ServerEvent) {
    this.emitter.emit("event", event);
  }

  /** Subscribe to server events */
  onEvent(listener: (event: ServerEvent) => void) {
    this.emitter.on("event", listener);
  }

  /** Enqueue a client command for later processing */
  enqueueCommand(cmd: ClientCommand) {
    this.commandQueue.push(cmd);
  }

  /** Dequeue the next pending client command */
  dequeueCommand(): ClientCommand | undefined {
    return this.commandQueue.shift();
  }

  /** Number of queued client commands */
  get pendingCommands() {
    return this.commandQueue.length;
  }

  /** Remove all event listeners */
  clearListeners() {
    this.emitter.removeAllListeners("event");
  }
}

export default EventBus;
