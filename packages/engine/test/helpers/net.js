/**
 * A socket pair for driving `NetClient` without a server process: what the
 * client sends lands in `outbox`; `deliver` plays a server message back.
 */
export function fakeSocket() {
  return {
    readyState: 1,
    outbox: [],
    send(data) { this.outbox.push(JSON.parse(data)); },
    close(code, reason) { this.readyState = 3; this.onclose?.({ code, reason }); },
    deliver(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
  };
}
