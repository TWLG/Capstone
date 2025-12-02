//a_DRIVER.ino
#include "Arduino_LED_Matrix.h" // LED Matrix library

// === Pin assignments ===
const int stepPin = 8;      // Step pulse -> CL57T PUL+
const int directionPin = 9; // Direction   -> CL57T DIR+
const int enaPin = 10;       // Enable      -> CL57T ENA+

// LED Matrix
ArduinoLEDMatrix matrix;
uint8_t grid[8][12] = {0}; // all off

// Motor state
unsigned long lastStepTime = 0;
unsigned long currentMotorSpeed = 800; // microseconds between steps
bool driverEnabled = true;             // tracks ENA
bool motorDirection = true;            // true = CW
bool motorActive = false;              // true = sending pulses

// === Forward declarations ===
void clearGrid();
void displayGrid();
void updateMatrixFromState();

void setMotorSpeed(unsigned long speedUs);
void setMotorDirection(bool direction);
void startMotor();
void stopMotor();
void stepperService();
void handleSerialLine(const String &line);

void setup() {
  delay(1000);
  Serial.begin(115200);

  matrix.begin();
  clearGrid();
  displayGrid();

  pinMode(stepPin, OUTPUT);
  pinMode(directionPin, OUTPUT);
  pinMode(enaPin, OUTPUT);

  // === ENA SELF-TEST (ACTIVE-LOW) ===
  Serial.println("ENA self-test: ENABLE 2s, DISABLE 2s...");

  // ENABLE (ENA = LOW)
  digitalWrite(enaPin, LOW);
  driverEnabled = true;
  updateMatrixFromState();
  delay(2000);

  // DISABLE (ENA = HIGH)
  digitalWrite(enaPin, HIGH);
  driverEnabled = false;
  updateMatrixFromState();
  delay(2000);

  // Leave driver ENABLED for operation
  Serial.println("Leaving driver ENABLED (ENA = LOW).");
  digitalWrite(enaPin, LOW);
  driverEnabled = true;
  updateMatrixFromState();


  // === MOTOR TEST ===
  Serial.println("Motor test: CW 2s...");
  setMotorDirection(true);
  setMotorSpeed(800);
  startMotor();
  unsigned long testStart = millis();
  while (millis() - testStart < 2000) stepperService();
  stopMotor();

  Serial.println("Motor test: CCW 2s...");
  setMotorDirection(false);
  setMotorSpeed(400);
  startMotor();
  testStart = millis();
  while (millis() - testStart < 2000) stepperService();
  stopMotor();

  Serial.println("Startup tests complete. Ready for USB commands.");

  updateMatrixFromState();
}

void loop() {
  // USB commands
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) handleSerialLine(line);
  }

  // Only step if driver enabled AND motor running
  if (driverEnabled && motorActive) {
    stepperService();
  }
}

/* SERIAL COMMAND HANDLER */

void handleSerialLine(const String &line) {
  Serial.print("CMD: ");
  Serial.println(line);

  if (line.startsWith("START")) {
    int sep = line.indexOf(' ');
    if (sep > 0) {
      long us = line.substring(sep + 1).toInt();
      if (us > 0) {
        setMotorSpeed((unsigned long)us);
        startMotor();
        Serial.print("OK START, interval(us) = ");
        Serial.println(currentMotorSpeed);
      } else {
        Serial.println("ERR START: invalid speed");
      }
    } else {
      Serial.println("ERR START: missing value");
    }
  }

  else if (line == "STOP") {
    stopMotor();
    Serial.println("OK STOP");
  }

  else if (line.startsWith("DIR")) {
    int sep = line.indexOf(' ');
    if (sep > 0) {
      int d = line.substring(sep + 1).toInt();
      setMotorDirection(d != 0);
      Serial.print("OK DIR ");
      Serial.println(d != 0 ? "CW" : "CCW");
    } else {
      Serial.println("ERR DIR: missing value");
    }
  }

  else if (line.startsWith("ENA")) {
    int sep = line.indexOf(' ');
    if (sep > 0) {
      int e = line.substring(sep + 1).toInt();

      // Active-LOW: 1 = enable (LOW), 0 = disable (HIGH)
      if (e) {
        digitalWrite(enaPin, LOW);   // enable
        driverEnabled = true;
      } else {
        digitalWrite(enaPin, HIGH);  // disable
        driverEnabled = false;
      }

      updateMatrixFromState();
      Serial.print("OK ENA ");
      Serial.println(e ? "ON (enabled)" : "OFF (disabled)");
    } else {
      Serial.println("ERR ENA: missing value");
    }
  }

  else if (line.startsWith("SET_SPEED")) {
    int sep = line.indexOf(' ');
    if (sep > 0) {
      long us = line.substring(sep + 1).toInt();
      if (us > 0) {
        setMotorSpeed((unsigned long)us);
        Serial.print("OK SET_SPEED, interval(us) = ");
        Serial.println(currentMotorSpeed);
      } else {
        Serial.println("ERR SET_SPEED: invalid speed");
      }
    } else {
      Serial.println("ERR SET_SPEED: missing value");
    }
  }

  else {
    Serial.println("ERR: unknown command");
  }
}


/* MOTOR CONTROL */

void stepperService() {
  unsigned long currentTime = micros();
  if (currentTime - lastStepTime >= currentMotorSpeed) {
    lastStepTime = currentTime;
    digitalWrite(directionPin, motorDirection ? HIGH : LOW);
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(2);
    digitalWrite(stepPin, LOW);
  }
}

void setMotorSpeed(unsigned long speedUs) {
  currentMotorSpeed = constrain(speedUs, 200UL, 4000UL);
  lastStepTime = 0;
  Serial.print("Motor speed set (interval us) = ");
  Serial.println(currentMotorSpeed);
  updateMatrixFromState();
}

void setMotorDirection(bool direction) {
  motorDirection = direction;
  Serial.print("Motor direction: ");
  Serial.println(direction ? "CW" : "CCW");
  updateMatrixFromState();
}

void startMotor() {
  // ENA is ACTIVE-LOW
  digitalWrite(enaPin, LOW);   // enable driver
  driverEnabled = true;
  motorActive = true;
  Serial.println("Motor STARTED (ENA active-LOW).");
  updateMatrixFromState();
}

void stopMotor() {
  digitalWrite(stepPin, LOW);
  digitalWrite(enaPin, HIGH);  // disable driver
  driverEnabled = false;
  motorActive = false;
  Serial.println("Motor STOPPED (ENA active-LOW).");
  updateMatrixFromState();
}

/* LED MATRIX */

void clearGrid() {
  for (int i = 0; i < 8; i++) for (int j = 0; j < 12; j++) grid[i][j] = 0;
  displayGrid();
}

void displayGrid() {
  matrix.renderBitmap(grid, 8, 12);
}

void updateMatrixFromState() {
  for (int r = 0; r < 8; r++) for (int c = 0; c < 12; c++) grid[r][c] = 0;

  grid[0][0] = driverEnabled ? 1 : 0;
  grid[0][1] = motorDirection ? 1 : 0;

  unsigned long val = currentMotorSpeed;

  for (int row = 1; row < 8; row++) {
    int digit = val % 10;
    val /= 10;
    for (int col = 0; col < digit && col < 12; col++) grid[row][col] = 1;
  }

  matrix.renderBitmap(grid, 8, 12);
}
