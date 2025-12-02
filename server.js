// server.js (VPS)
const WebSocket = require("ws");

const PORT = 4000;

// VPS WebSocket Server
const wss = new WebSocket.Server({ host: "127.0.0.1", port: PORT });
console.log("WebSocket server listening on 127.0.0.1:" + PORT);

const deviceSockets = new Map(); // deviceId -> ws
const uiSockets = new Set();     // remote UIs

wss.on("connection", (ws, req) => {
  // role detection query string ?role=device&deviceId=...
  const url = new URL(req.url, "ws://localhost");
  const role = url.searchParams.get("role") || "ui";
  const deviceId = url.searchParams.get("deviceId") || null;

  if (role === "device" && deviceId) {
    console.log(`Device connected: ${deviceId}`);
    deviceSockets.set(deviceId, ws);
  } else {
    console.log("UI client connected");
    uiSockets.add(ws);
  }

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); }
    catch (e) { console.error("Bad JSON:", data.toString()); return; }

    // 1) broadcast state to frontends
    if (msg.type === "state" && msg.deviceId && msg.source === "pi") {
      for (const ui of uiSockets) {
        if (ui.readyState === WebSocket.OPEN) {
          ui.send(JSON.stringify(msg));
        }
      }
    }

    // 2) command to device
    if (msg.type === "command" && msg.deviceId && msg.payload) {
      const dev = deviceSockets.get(msg.deviceId);
      if (dev && dev.readyState === WebSocket.OPEN) {
        dev.send(JSON.stringify(msg));
      }
    }
  });

  ws.on("close", () => {
    if (role === "device" && deviceId) {
      console.log(`Device disconnected: ${deviceId}`);
      if (deviceSockets.get(deviceId) === ws) {
        deviceSockets.delete(deviceId);
      }
    } else {
      uiSockets.delete(ws);
      console.log("UI client disconnected");
    }
  });
});
