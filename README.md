# Remote Stepper Motor Control (Arduino + Raspberry Pi + VPS + WebSockets)

Small end-to-end example for remote motor control over the public internet.

Components
- Arduino UNO R4 Wi‑Fi + CL57T stepper driver + NEMA 24 closed‑loop stepper
- Raspberry Pi (bridge: USB serial ⇄ WebSocket)
- VPS (Node.js WebSocket relay, Nginx, TLS via Let’s Encrypt)
- HTML/JS frontend served from the VPS over HTTPS

High level flow
Browser UI ⇄ wss://your-domain/ws (VPS) ⇄ Raspberry Pi ⇄ USB Serial ⇄ Arduino ⇄ Stepper driver

Repository layout (recommended)
```
.
├── a_DRIVER/
│   └── a_DRIVER.ino
├── pi_controller.js
├── server.js
├── nginx_config.txt
└── motor.html
```

Quick setup guide

1) Arduino (UNO R4 Wi‑Fi)
- Open the Arduino IDE and install the LED matrix library referenced at the top of [`a_DRIVER/a_DRIVER.ino`](a_DRIVER/a_DRIVER.ino).
- Open and upload [`a_DRIVER/a_DRIVER.ino`](a_DRIVER/a_DRIVER.ino) to the Arduino (board: "Arduino Uno R4 WiFi", baud: 115200).
- The sketch listens for USB serial lines handled by [`handleSerialLine`](a_DRIVER/a_DRIVER.ino). Commands include:
  - `START <us>` — start pulses with interval in microseconds
  - `STOP`
  - `DIR <0|1>`
  - `ENA <0|1>`
  - `SET_SPEED <us>`

2) Raspberry Pi (Pi → Arduino bridge)
- Install Node and dependencies on the Pi:
```sh
sudo apt update
sudo apt-get install -y nodejs npm
cd /path/to/Capstone
npm install ws serialport express
```
- Edit `pi_controller.js` to set the correct serial port (`SERIAL_PORT`) and the VPS URL (`VPS_WS_URL`).
- Start the bridge:
```sh
node pi_controller.js
```
- The Pi serves a local control UI at http://localhost:3000 and forwards commands to the Arduino. See [`VPS_WS_URL`](pi_controller.js) and [`pi_controller.js`](pi_controller.js).

3) VPS: Nginx, Certbot, serve frontend
- Copy `nginx_config.txt` to your VPS (e.g. `/etc/nginx/sites-available/motor.conf`) and adjust `server_name` and paths.
- Obtain TLS certificates with Certbot (choose nginx / your OS at https://certbot.eff.org/).
- Place `motor.html` under your web root (e.g. `/var/www/html/motor.html`).

4) VPS: WebSocket relay
- On the VPS, install Node and start the relay:
```sh
npm install ws
node server.js
```
- `server.js` listens for device connections and UI clients and forwards `state` and `command` messages. See [`server.js`](server.js).

Notes and ranges
- Pulse interval: 200–4000 µs (lower = faster).
- UI uses `wss://<host>/ws/?role=ui&deviceId=...`. The Pi device connects with `?role=device&deviceId=...`.
