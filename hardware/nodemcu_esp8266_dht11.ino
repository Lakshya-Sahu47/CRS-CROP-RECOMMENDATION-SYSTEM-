/*
 * ╔══════════════════════════════════════════════════════╗
 * ║   IoT Crop Recommendation System — NodeMCU ESP8266  ║
 * ║   Sensor : DHT11 (Temp + Humidity)                  ║
 * ║   Data   : Sends JSON to Flask API via HTTP POST    ║
 * ║   v2.0   : Interval increased to 15 minutes         ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * Wiring:
 *   DHT11 VCC  → 3.3V
 *   DHT11 GND  → GND
 *   DHT11 DATA → D2 (GPIO4)
 *
 * Libraries needed (Arduino IDE):
 *   - DHT sensor library (Adafruit)
 *   - Adafruit Unified Sensor
 *   - ESP8266WiFi (built-in with ESP8266 board package)
 *   - ESP8266HTTPClient (built-in)
 *   - ArduinoJson (install via Library Manager)
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// ── WiFi Credentials ─────────────────────────────────────
const char* WIFI_SSID     = "DESKTOP-B8HG97T 0255";
const char* WIFI_PASSWORD = "78j8T8k0";
 // <-- Change this

// ── Flask Server ─────────────────────────────────────────
// Set this to your PC's local IP address on the same WiFi network.
const char* FLASK_HOST    = "http://172.25.165.191:5000";
const char* ENDPOINT   = "/api/sensor-data";

// ── DHT11 Config ─────────────────────────────────────────
#define DHTPIN  4      // GPIO4 = D2 on NodeMCU
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ── Timing ───────────────────────────────────────────────
/*
 * [v2.0] Interval changed from 5 seconds to 15 minutes (900,000 ms).
 *
 * Reasons:
 *  1. OpenWeather API free tier has a rate limit of 60 calls/minute.
 *     Polling every 5 seconds from multiple devices could exhaust this quickly.
 *  2. DHT11 is a low-frequency sensor — temperature and humidity in an
 *     agricultural field do not change meaningfully within seconds.
 *     15-minute readings are sufficient and agronomically accurate.
 *  3. Reduced POST frequency lowers ESP8266 power consumption, which
 *     is important for battery-powered field deployments.
 *  4. Flask server load is reduced, making the system more stable in
 *     production or when running on a low-spec machine.
 */
const unsigned long SEND_INTERVAL_MS = 900000UL;  // 15 minutes = 900,000 ms
unsigned long lastSendTime = 0;

// ─────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.println("\n╔══════════════════════════════════╗");
  Serial.println("║  CRS — NodeMCU ESP8266 Starting  ║");
  Serial.println("║  Interval : 15 minutes  (v2.0)   ║");
  Serial.println("╚══════════════════════════════════╝");

  dht.begin();

  // Connect to WiFi
  Serial.printf("\nConnecting to WiFi: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempts++;
    if (attempts > 40) {
      Serial.println("\n[ERROR] WiFi connection failed. Restarting...");
      ESP.restart();
    }
  }

  Serial.println("\n[OK] WiFi connected!");
  Serial.printf("[OK] IP Address : %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[OK] Flask URL  : %s%s\n", FLASK_HOST, ENDPOINT);
  Serial.println("[OK] Sending first reading immediately...\n");

  // Send the first reading immediately on boot
  // (don't wait 15 minutes before first data point)
  lastSendTime = millis() - SEND_INTERVAL_MS;
}

// ─────────────────────────────────────────────────────────

void loop() {
  unsigned long now = millis();

  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;

    // ── Read DHT11 sensor ─────────────────────────────────
    float temperature = dht.readTemperature();
    float humidity    = dht.readHumidity();

    if (isnan(temperature) || isnan(humidity)) {
      Serial.println("[ERROR] DHT11 read failed. Check wiring or sensor.");
      return;
    }

    Serial.printf("[SENSOR] Temp: %.1f°C  |  Humidity: %.1f%%\n",
                  temperature, humidity);

    // ── Build JSON payload ────────────────────────────────
    StaticJsonDocument<128> doc;
    doc["temperature"] = round(temperature * 10) / 10.0;
    doc["humidity"]    = round(humidity * 10) / 10.0;
    doc["device_id"]   = "ESP8266_CRS_01";

    String payload;
    serializeJson(doc, payload);

    // ── HTTP POST to Flask ────────────────────────────────
    if (WiFi.status() == WL_CONNECTED) {
      WiFiClient wifiClient;
      HTTPClient http;

      String url = String(FLASK_HOST) + ENDPOINT;
      http.begin(wifiClient, url);
      http.addHeader("Content-Type", "application/json");

      int httpCode = http.POST(payload);

      if (httpCode > 0) {
        Serial.printf("[HTTP]  Response code : %d\n", httpCode);
        if (httpCode == HTTP_CODE_OK) {
          String response = http.getString();
          Serial.printf("[HTTP]  Response body : %s\n", response.c_str());
        }
      } else {
        Serial.printf("[HTTP]  POST failed, error: %s\n",
                      http.errorToString(httpCode).c_str());
      }

      http.end();
      Serial.printf("[INFO]  Next reading in 15 minutes.\n\n");

    } else {
      // WiFi dropped — attempt reconnection
      Serial.println("[WARN] WiFi disconnected. Reconnecting...");
      WiFi.reconnect();
    }
  }

  // Small delay to yield the CPU and avoid watchdog resets
  delay(100);
}
