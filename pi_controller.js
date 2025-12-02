// pi-controller.js (Raspberry Pi)
const WebSocket = require("ws");
const SerialPort = require("serialport").SerialPort;
const ReadlineParser = require("serialport").ReadlineParser;
const express = require("express");
const http = require("http");

const DEVICE_ID = "pi-motor-1";
const VPS_WS_URL = "wss://twlg.net/ws/?role=device&deviceId=" + DEVICE_ID;
const SERIAL_PORT = "/dev/ttyACM0";  // adjust if needed
const BAUD_RATE = 115200;

// --- Serial to Arduino ---
const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

parser.on("data", (line) => {
  console.log("ARDUINO:", line.trim());
});

function sendToArduino(cmd) {
  console.log("=> ARDUINO:", cmd);
  port.write(cmd.trim() + "\n");
}

// Current state cache
const state = {
  ena: true,
  dir: 1,
  intervalUs: 800,
  active: false,
};

// Helper: send state up to VPS
let vpsSocket = null;
function sendStateToVps() {
  if (!vpsSocket || vpsSocket.readyState !== WebSocket.OPEN) return;
  const msg = {
    type: "state",
    deviceId: DEVICE_ID,
    source: "pi",
    payload: { ...state },
  };
  vpsSocket.send(JSON.stringify(msg));
}

// Apply command to Arduino + update local state
function applyCommand(payload, source = "vps") {
  const { action, value } = payload;

  switch (action) {
    case "START":
      if (typeof value === "number") {
        state.intervalUs = value;
        sendToArduino(`START ${value}`);
        state.active = true;
      }
      break;

    case "STOP":
      sendToArduino("STOP");
      state.active = false;
      break;

    case "DIR":
      state.dir = value ? 1 : 0;
      sendToArduino(`DIR ${state.dir}`);
      break;

    case "ENA":
      state.ena = !!value;
      sendToArduino(`ENA ${state.ena ? 1 : 0}`);
      break;

    case "SET_SPEED":
      state.intervalUs = value;
      sendToArduino(`SET_SPEED ${value}`); // update speed immediately
      break;


    default:
      console.log("Unknown action:", action);
  }

  // after every change, push state up
  sendStateToVps();
}

// Connect to VPS WebSocket 
function connectVps() {
  console.log("Connecting to VPS:", VPS_WS_URL);
  vpsSocket = new WebSocket(VPS_WS_URL);

  vpsSocket.on("open", () => {
    console.log("Connected to VPS");
    sendStateToVps();
  });

  vpsSocket.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); }
    catch (e) { console.error("Bad JSON from VPS:", data.toString()); return; }

    if (msg.type === "command" && msg.deviceId === DEVICE_ID) {
      console.log("CMD from VPS:", msg.payload);
      applyCommand(msg.payload, "vps");
    }
  });

  vpsSocket.on("close", () => {
    console.log("VPS connection closed, retrying in 5s...");
    setTimeout(connectVps, 5000);
  });

  vpsSocket.on("error", (err) => {
    console.error("VPS WS error:", err.message);
  });
}

connectVps();

// Local web server for LAN control 
const app = express();
const server = http.createServer(app);
app.use(express.json());

// simple REST API for local control
app.get("/api/state", (req, res) => {
  res.json(state);
});

app.post("/api/command", (req, res) => {
  const payload = req.body; // { action, value }
  console.log("Local command:", payload);
  applyCommand(payload, "local-ui");
  res.json({ ok: true, state });
});

// test page
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Local Motor Control</title>
        <style>
          body {
            font-family: system-ui, sans-serif;
            max-width: 600px;
            margin: 2rem auto;
            padding: 1rem;
          }
          h1 {
            margin-bottom: 1rem;
          }
          .section {
            margin-bottom: 1.5rem;
          }
          button {
            margin: 0.25rem;
            padding: 0.4rem 0.8rem;
          }
          #state {
            background: #111;
            color: #0f0;
            padding: 0.5rem;
            font-family: monospace;
            font-size: 0.85rem;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <h1>Local Motor Control</h1>

        <div class="section">
          <label>
            Pulse interval (microseconds):
            <input type="number" id="usInput" min="200" max="4000" step="1" value="800" />
          </label>
          <button type="button" onclick="applySpeed()">Set</button>
          <div>
            <small><span id="spsValue">1250</span> steps/sec</small>
          </div>
        </div>

        <div class="section">
          <button type="button" onclick="startMotor()">Start</button>
          <button type="button" onclick="stopMotor()">Stop</button>
        </div>

        <div class="section">
          <strong>Power (ENA)</strong><br />
          <button type="button" onclick="setPower(true)">Power ON</button>
          <button type="button" onclick="setPower(false)">Power OFF</button>
        </div>

        <div class="section">
          <strong>Direction</strong><br />
          <button type="button" onclick="setDir(1)">CW</button>
          <button type="button" onclick="setDir(0)">CCW</button>
        </div>

        <div class="section">
          <strong>Current State</strong>
          <pre id="state"></pre>
        </div>

        <script>
          async function send(action, value) {
            await fetch('/api/command', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action, value })
            });
            refresh();
          }

          function startMotor() {
            const us = parseInt(document.getElementById('usInput').value, 10);
            if (!isNaN(us) && us >= 200 && us <= 4000) {
              send('START', us);
            } else {
              alert("Enter a value between 200 and 4000 µs before starting");
            }
          }

          function stopMotor() {
            send('STOP');
          }

          function setPower(on) {
            // ENA 1 = enabled (rigid), ENA 0 = disabled (free)
            send('ENA', on ? 1 : 0);
          }

          function setDir(dir) {
            send('DIR', dir ? 1 : 0);
          }

          function applySpeed() {
            const us = parseInt(document.getElementById('usInput').value, 10);
            if (!isNaN(us) && us >= 200 && us <= 4000) {
              send('SET_SPEED', us);
            } else {
              alert("Enter a value between 200 and 4000 µs");
            }
          }

          function updateSpeedLabels(us) {
            const spsVal = document.getElementById('spsValue');
            const sps = Math.round(1000000 / us);
            spsVal.textContent = sps;
          }

          async function refresh() {
            try {
              const res = await fetch('/api/state');
              const st = await res.json();
              document.getElementById('state').innerText =
                JSON.stringify(st, null, 2);

              if (typeof st.intervalUs === "number") {
                const box = document.getElementById('usInput');
                box.value = st.intervalUs;
                updateSpeedLabels(st.intervalUs);
              }
            } catch (e) {
              document.getElementById('state').innerText = 'Error loading state';
            }
          }

          // Initial load
          refresh();
        </script>
      </body>
    </html>
  `);
});


const LOCAL_PORT = 3000;
server.listen(LOCAL_PORT, () => {
  console.log("Local control UI at http://localhost:" + LOCAL_PORT);
});
