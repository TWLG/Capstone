# Remote Stepper Motor Control (Arduino + Raspberry Pi + VPS + WebSockets)

End-to-end self-hosted IoT pipeline for remote stepper motor control over the public internet via WebSockets — no proprietary cloud platform required.

## Full Tutorial

For complete step-by-step assembly and setup instructions, see the project tutorial page:

**[https://twlg.github.io/Capstone/](https://twlg.github.io/Capstone/)**

Covers hardware wiring, CL57T driver configuration, Arduino setup, Raspberry Pi bridge setup, VPS/Nginx/TLS configuration, and using the browser UI.

---

## Hardware Used

- Arduino UNO R4 WiFi — USB serial, 5 V logic output to CL57T
- CL57T closed-loop stepper driver — 5 V signal mode, SW1–3 ON (1000 pulses/rev)
- NEMA 24 closed-loop stepper motor
- Raspberry Pi 5 (Wi-Fi) — Node.js bridge between Arduino and VPS
- VPS with Nginx + TLS — WebSocket relay and frontend host

## System Flow

```
Browser UI(s)  ⇄  wss://host/ws (VPS + Nginx)  ⇄  Raspberry Pi  ⇄  USB-C Serial  ⇄  Arduino  ⇄  CL57T  ⇄  NEMA 24
```

The relay (`server.js`) is many-to-many in both directions — multiple Pis and multiple browser UIs can connect simultaneously. Switch between devices in the UI by changing the Device ID.

## Repository Layout

```
.
├── a_DRIVER/
│   └── a_DRIVER.ino       # Arduino sketch — serial command parser + stepper pulse generation
├── pi_controller.js        # Raspberry Pi bridge — USB serial ⇄ VPS WebSocket + local UI on :3000
├── server.js               # VPS WebSocket relay — routes state and command messages
├── nginx_config.txt        # Nginx config — HTTPS, WebSocket proxy, basic auth
├── motor.html              # Browser frontend — served from VPS over HTTPS
└── docs/                   # GitHub Pages tutorial site
```

## Serial Commands (Arduino, 115200 baud)

| Command | Description |
|---|---|
| `START <us>` | Start motor at pulse interval in microseconds |
| `STOP` | Stop motor |
| `DIR <0\|1>` | Set direction (1 = CW, 0 = CCW) |
| `ENA <0\|1>` | Enable/disable driver (active-LOW) |
| `SET_SPEED <us>` | Update speed while running |

Pulse interval range: 200–4000 µs (lower = faster). At 1000 pulses/rev: 800 µs ≈ 1,250 steps/sec.

## Contributing

Pull requests are welcome. See the tutorial page for context on how the system works before submitting changes.
