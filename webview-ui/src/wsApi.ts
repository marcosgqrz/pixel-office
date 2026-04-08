// WebSocket API — replaces VS Code postMessage bridge
// Use ws:// for localhost (dev or production build served locally)
// Use wss:// for remote hosts (Railway, etc.)
const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";
const WS_PROTOCOL = isLocalhost ? "ws" : "wss";
const WS_URL = import.meta.env.DEV
  ? "ws://localhost:3456"
  : `${WS_PROTOCOL}://${window.location.host}`;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connectWebSocket(): void {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("Connected to pixel-agents server");
    ws?.send(JSON.stringify({ type: "webviewReady" }));
  };

  ws.onmessage = (event) => {
    // Dispatch as window message to match upstream useExtensionMessages hook
    const data = JSON.parse(event.data);
    window.dispatchEvent(new MessageEvent("message", { data }));
  };

  ws.onclose = () => {
    console.log("Disconnected, reconnecting in 2s...");
    reconnectTimer = setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = () => ws?.close();
}

export function sendMessage(msg: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function cleanup(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
}
