# 🌾 CRS — IoT Crop Recommendation System

> A production-grade, multi-modal AI system that combines **NodeMCU ESP8266 IoT sensors**, **CNN soil classification**, **XGBoost crop prediction**, and **live weather data** into a unified Flask web application — purpose-built for smart, data-driven agriculture.

---

## 📌 Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [System Architecture](#3-system-architecture)
4. [Technology Stack](#4-technology-stack)
5. [Hardware Requirements](#5-hardware-requirements)
6. [Software Requirements](#6-software-requirements)
7. [Project Structure](#7-project-structure)
8. [Setup Guide](#8-setup-guide)
9. [API Endpoints](#9-api-endpoints)
10. [Logging System](#10-logging-system)
11. [Future Scope](#11-future-scope)

---

## 1. Project Overview

### What the system does

CRS is an end-to-end intelligent crop advisory system for farmers and agricultural researchers. A farmer provides:

- A **photo of their soil** (optional)
- Basic **soil nutrient values** (N, P, K) and **pH**
- The current **month**

The system automatically:

1. **Classifies the soil type** from the uploaded image using a MobileNetV2 CNN
2. **Reads real-time temperature and humidity** from a DHT11 sensor connected to a NodeMCU ESP8266 microcontroller over WiFi
3. **Fetches live rainfall data** from the OpenWeather API
4. **Runs feature engineering** to build a 10-feature input vector
5. **Predicts the top 3 most suitable crops** using a trained XGBoost classifier, with confidence scores and agronomic reasons
6. **Logs every prediction** to a local JSON file for future model retraining

### Why it is useful

Traditional crop selection relies on experience and guesswork. CRS replaces guesswork with real sensor data and machine learning — helping farmers make evidence-based decisions that maximise yield, conserve resources, and adapt to actual field conditions.

---

## 2. Features

### 🛰️ IoT Integration
- NodeMCU ESP8266 posts live DHT11 readings (temperature + humidity) to Flask every 15 minutes
- Automatic fallback to OpenWeather API if sensor is offline
- Device ID tracking for multi-sensor deployments

### 🤖 AI Models
- **Soil CNN**: MobileNetV2 fine-tuned on 7 soil types (alluvial, black, clay, laterite, loamy, red, sandy)
- **Crop XGBoost**: Trained on 22 crop classes using 10 engineered features
- Both models are loaded at startup; soil classification is optional

### 🌦️ Real-Time Data
- Live rainfall pulled from OpenWeather API on every prediction request
- Live sensor feed endpoint (`/api/live-sensor`) polled by the frontend dashboard

### 📋 Prediction Logging
- Every `/api/predict` call appends a full JSON record to `logs/predictions.json`
- Logs include: timestamp, device ID, all inputs, all predictions, and inference time
- Data is preserved across server restarts — used for future retraining

### ✅ Input Validation
- pH validated to 0–14
- N, P, K validated to 0–200
- Month validated to 1–12
- Image format validated (JPG, PNG, WEBP only)
- All errors return structured JSON with error codes

### ⚡ Performance Tracking
- Inference time measured for every `/api/predict` call
- Returned in the response as `inference_time_ms`

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         INPUT LAYER                             │
│                                                                 │
│  📷 Soil Image    📡 DHT11 / ESP8266    🌦️ OpenWeather API      │
│  (JPG/PNG/WEBP)   (Temp + Humidity)      (Rainfall)             │
│       │                  │                     │                │
└───────┼──────────────────┼─────────────────────┼────────────────┘
        │                  │                     │
        ▼                  ▼                     ▼
┌───────────────┐  ┌───────────────┐    ┌───────────────┐
│  CNN Soil     │  │  In-Memory    │    │  Requests to  │
│  Classifier   │  │  Sensor Cache │    │  OW REST API  │
│ MobileNetV2   │  │  (app.py)     │    │               │
└───────┬───────┘  └───────┬───────┘    └───────┬───────┘
        │  soil_type        │ temp, hum           │ rainfall
        └──────────┬────────┘                    │
                   ▼                             │
┌──────────────────────────────────────────────────────────────┐
│                   FEATURE ENGINEERING                        │
│  N, P, K, ph, month (user input)                             │
│  + temperature, humidity (sensor/API)                        │
│  + rainfall (API)                                            │
│  + soil_type encoded (CNN output)                            │
│  → 10 engineered features (incl. sin/cos month, ratios)      │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │   XGBoost Classifier    │
              │  (22 crop classes)      │
              └─────────────┬───────────┘
                            │
                ┌───────────▼────────────┐
                │   Top 3 Predictions    │
                │  + Confidence Scores   │
                │  + Agronomic Reasons   │
                └───────────┬────────────┘
                            │
               ┌────────────▼─────────────┐
               │   JSON Response          │
               │   + logs/predictions.json│
               └──────────────────────────┘
```

**Full data pipeline:**

1. Farmer opens the web dashboard at `http://localhost:5000`
2. ESP8266 (field device) POSTs DHT11 readings to `/api/sensor-data` every 15 minutes
3. Farmer uploads an optional soil image and fills in NPK/pH/month form fields
4. `/api/predict` is called → soil CNN runs → weather API is called → XGBoost predicts
5. Top 3 crops are returned with confidence and reason
6. Full prediction record is appended to `logs/predictions.json`

---

## 4. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend | Python 3.10+, Flask 3.0 | REST API + template serving |
| ML — Crop | XGBoost 2.0 | Crop classification (22 classes) |
| ML — Soil | TensorFlow 2.19, MobileNetV2 | Soil image classification (7 types) |
| Feature Engineering | NumPy, Pandas | Input preprocessing |
| Model Serialisation | Joblib | Load .pkl model files |
| Image Processing | Pillow | Resize and normalise soil images |
| Weather | OpenWeather API | Live rainfall data |
| IoT | NodeMCU ESP8266, DHT11 | Field temperature + humidity |
| Frontend | HTML5, CSS3, Vanilla JS | Web dashboard |
| CORS | Flask-CORS | Cross-origin requests |
| Logging | Python `json` module | Prediction logging to file |

---

## 5. Hardware Requirements

### Components

| Component | Quantity | Notes |
|---|---|---|
| NodeMCU ESP8266 (ESP-12E) | 1 | Main WiFi microcontroller |
| DHT11 Temperature & Humidity Sensor | 1 | Field sensor |
| Jumper wires | 3 | Male-to-male or male-to-female |
| USB cable (Micro-USB) | 1 | For programming and power |
| Breadboard (optional) | 1 | For prototyping connections |

### Wiring Diagram

```
NodeMCU ESP8266            DHT11 Sensor
──────────────────         ─────────────────
  3.3V ──────────────────→  VCC  (Pin 1)
  GND  ──────────────────→  GND  (Pin 4)
  D2   (GPIO4) ──────────→  DATA (Pin 2)

Note: Pin 3 on DHT11 is not connected (NC).
```

### Notes on DHT11
- Operating voltage: 3.3V–5V (NodeMCU 3.3V is sufficient)
- Temperature range: 0–50°C (accuracy ±2°C)
- Humidity range: 20–80% RH (accuracy ±5%)
- Minimum sampling interval: 1 second (we use 15 minutes — well within limits)

---

## 6. Software Requirements

### Python
- **Version**: Python 3.10 or higher (3.11 recommended)
- **Environment**: Virtual environment strongly recommended

### Python Libraries

All dependencies are listed in `requirements.txt`:

```
flask==3.0.0
flask-cors==4.0.0
tensorflow==2.19.0
numpy==1.26.4
pandas==2.0.3
scikit-learn==1.3.0
xgboost==2.0.3
joblib==1.3.2
pillow==10.0.1
requests==2.31.0
```

### Arduino IDE (for ESP8266)
- Arduino IDE 2.x
- Board: **NodeMCU 1.0 (ESP-12E Module)**
- Board package: ESP8266 by ESP8266 Community (install via Board Manager)
- Libraries (install via Library Manager):
  - `DHT sensor library` by Adafruit
  - `Adafruit Unified Sensor` by Adafruit
  - `ArduinoJson` by Benoit Blanchon

---

## 7. Project Structure

```
crop-recommendation-system/
│
├── backend/
│   ├── app.py              # Flask server — all API routes
│   └── logger.py           # JSON prediction logger (v2.0)
│
├── frontend/
│   ├── templates/
│   │   └── index.html      # Web dashboard
│   └── static/
│       ├── style.css
│       └── script.js
│
├── hardware/
│   └── nodemcu_esp8266_dht11.ino   # ESP8266 firmware
│
├── model/                  # ← Place your trained model files here
│   ├── soil_model_weights.weights.h5  # CNN soil classifier weights
│   ├── class_indices.txt              # Soil class index map
│   ├── model.pkl                      # XGBoost crop model
│   ├── label_encoder.pkl              # Crop label encoder
│   ├── soil_encoder.pkl               # Soil type encoder
│   └── feature_columns.pkl            # Feature column order
│
├── logs/
│   └── predictions.json    # Auto-created on first prediction (v2.0)
│
├── requirements.txt
└── README.md
```

---

## 8. Setup Guide

### Step 1 — Clone the repository

```bash
git clone https://github.com/your-username/crop-recommendation-system.git
cd crop-recommendation-system
```

### Step 2 — Create a virtual environment

```bash
python -m venv venv
```

Activate it:

```bash
# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### Step 3 — Install Python dependencies

```bash
pip install -r requirements.txt
```

> **Note:** TensorFlow installation may take a few minutes. Ensure you have at least 2 GB of free disk space.

### Step 4 — Obtain an OpenWeather API key

1. Go to [https://openweathermap.org/api](https://openweathermap.org/api)
2. Sign up for a free account
3. Navigate to **API Keys** in your account dashboard
4. Copy your API key

### Step 5 — Set environment variables

```bash
# Windows (Command Prompt)
set OPENWEATHER_API_KEY=your_api_key_here
set CITY_NAME=Bhopal
set COUNTRY_CODE=IN

# macOS / Linux
export OPENWEATHER_API_KEY=your_api_key_here
export CITY_NAME=Bhopal
export COUNTRY_CODE=IN
```

> Replace `Bhopal` with the city nearest to your farm or test location.

### Step 6 — Add trained model files

Place the following files into the `model/` directory:

| File | How to obtain |
|---|---|
| `soil_model_weights.weights.h5` | Export weights from Colab: `model.save_weights('soil_model_weights.weights.h5')` |
| `class_indices.txt` | Save class index map from training notebook |
| `model.pkl` | `joblib.dump(xgb_model, 'model.pkl')` |
| `label_encoder.pkl` | `joblib.dump(label_encoder, 'label_encoder.pkl')` |
| `soil_encoder.pkl` | `joblib.dump(soil_encoder, 'soil_encoder.pkl')` |
| `feature_columns.pkl` | `joblib.dump(list(X_train.columns), 'feature_columns.pkl')` |

> **class_indices.txt format** (one line per class):
> ```
> 0,alluvial
> 1,black
> 2,clay
> ...
> ```

### Step 7 — Flash the ESP8266

1. Open `hardware/nodemcu_esp8266_dht11.ino` in Arduino IDE
2. Edit these three lines at the top:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* FLASK_HOST    = "http://192.168.X.X:5000";  // your PC's LAN IP
   ```
   > Find your PC's local IP: run `ipconfig` (Windows) or `ifconfig` (Linux/Mac)
3. Select board: **NodeMCU 1.0 (ESP-12E Module)**
4. Select the correct COM port
5. Click **Upload**

The device will connect to WiFi and start POSTing sensor data immediately, then every 15 minutes.

### Step 8 — Run the Flask server

```bash
python backend/app.py
```

Expected output:
```
============================================================
  🌾 CRS — Flask Server Starting  (v2.0)
  📡 Listening for ESP8266 at /api/sensor-data
  🌐 Dashboard : http://localhost:5000
  📋 Logs      : logs/predictions.json
============================================================
```

### Step 9 — Open the dashboard

Open your browser and navigate to:

```
http://localhost:5000
```

You should see the CRS web dashboard. If the ESP8266 is running on the same network, the live sensor panel will update automatically.

---

## 9. API Endpoints

### `GET /`
Serves the web dashboard (`index.html`).

---

### `POST /api/sensor-data`
Receives DHT11 readings from the ESP8266 (called automatically by firmware).

**Request body (JSON):**
```json
{
  "temperature": 27.3,
  "humidity": 65.0,
  "device_id": "ESP8266_CRS_01"
}
```

**Success response:**
```json
{ "status": "ok", "received": { ... } }
```

---

### `GET /api/live-sensor`
Returns the most recent sensor reading stored in memory.

**Response:**
```json
{
  "temperature": 27.3,
  "humidity": 65.0,
  "timestamp": "2025-07-15T14:30:00.123456",
  "device_id": "ESP8266_CRS_01"
}
```

---

### `GET /api/weather`
Fetches current weather from OpenWeather API.

**Query params:** `?city=Mumbai` (optional — defaults to `CITY_NAME` env var)

**Response:**
```json
{
  "temperature": 29.1,
  "humidity": 72.0,
  "rainfall_mm": 4.2,
  "city": "Bhopal"
}
```

---

### `POST /api/predict`
**Main prediction endpoint.** Accepts `multipart/form-data`.

**Form fields:**

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `soil_image` | File | No | JPG/PNG/WEBP | Soil photograph |
| `N` | float | No | 0–200 | Nitrogen (kg/ha) |
| `P` | float | No | 0–200 | Phosphorus (kg/ha) |
| `K` | float | No | 0–200 | Potassium (kg/ha) |
| `ph` | float | No | 0–14 | Soil pH |
| `month` | int | No | 1–12 | Current month number |
| `temperature` | float | No | -50–60 | Fallback if ESP offline |
| `humidity` | float | No | 0–100 | Fallback if ESP offline |
| `city` | string | No | — | Override weather city |

**Success response:**
```json
{
  "status": "success",
  "inputs": {
    "temperature": 28.5,
    "humidity": 65.0,
    "rainfall_mm": 12.3,
    "N": 50, "P": 30, "K": 40,
    "ph": 6.5,
    "month": 7,
    "soil_type": "alluvial",
    "soil_confidence": 91.2
  },
  "predictions": [
    { "rank": 1, "crop": "Rice",  "confidence": 78.4, "reason": "High humidity and rainfall match rice's water requirements. (Best match)" },
    { "rank": 2, "crop": "Jute",  "confidence": 12.1, "reason": "High rainfall and humidity are perfect for jute. (Good alternative)" },
    { "rank": 3, "crop": "Maize", "confidence": 5.6,  "reason": "Warm temperature and moderate rainfall are ideal for maize. (Possible option)" }
  ],
  "inference_time_ms": 134.5,
  "timestamp": "2025-07-15T14:31:02.456789"
}
```

**Validation error response (HTTP 400):**
```json
{
  "status": "error",
  "message": "Invalid input: 'ph' must be between 0 and 14. Got: 17.0",
  "code": "INVALID_INPUT"
}
```

**Model not loaded response (HTTP 503):**
```json
{
  "status": "error",
  "message": "Crop model not loaded. Place model.pkl and label_encoder.pkl in /model.",
  "code": "MODEL_NOT_LOADED"
}
```

---

### `POST /api/predict-soil`
Classify soil type from an image only (no crop prediction).

**Form fields:** `soil_image` (file — JPG/PNG/WEBP)

**Response:**
```json
{ "soil_type": "alluvial", "confidence": 91.2 }
```

---

### `GET /api/status`
System health check — returns the status of all components.

**Response:**
```json
{
  "status": "ok",
  "soil_model_loaded": true,
  "crop_model_loaded": true,
  "soil_encoder_loaded": true,
  "feature_cols_loaded": true,
  "sensor_connected": true,
  "last_sensor_update": "2025-07-15T14:30:00.123456",
  "openweather_key_set": true,
  "logs_available": true
}
```

---

### `POST /api/predict-disease`
Classify crop disease from a leaf image (requires `disease_model.h5`).

**Form fields:** `leaf_image` (file)

**Response:**
```json
{
  "status": "success",
  "predictions": [
    { "rank": 1, "disease": "Leaf Blight",     "confidence": 84.3 },
    { "rank": 2, "disease": "Bacterial Spot",  "confidence": 9.1  },
    { "rank": 3, "disease": "Healthy",         "confidence": 3.2  }
  ]
}
```

---

## 10. Logging System

Every call to `/api/predict` automatically appends a full record to `logs/predictions.json`.

### File location
```
crop-recommendation-system/
└── logs/
    └── predictions.json   ← auto-created on first prediction
```

### Log entry structure

```json
{
  "timestamp": "2025-07-15T14:31:02.456789",
  "device_id": "ESP8266_CRS_01",
  "inputs": {
    "temperature": 28.5,
    "humidity": 65.0,
    "rainfall_mm": 12.3,
    "N": 50,
    "P": 30,
    "K": 40,
    "ph": 6.5,
    "month": 7,
    "soil_type": "alluvial",
    "soil_confidence": 91.2
  },
  "predictions": [
    { "rank": 1, "crop": "Rice",  "confidence": 78.4, "reason": "..." },
    { "rank": 2, "crop": "Jute",  "confidence": 12.1, "reason": "..." },
    { "rank": 3, "crop": "Maize", "confidence": 5.6,  "reason": "..." }
  ],
  "inference_time_ms": 134.5
}
```

### Key properties

- **Non-destructive**: New entries are always appended. No data is ever overwritten.
- **Auto-initialised**: The `logs/` directory and `predictions.json` file are created automatically on the first prediction if they do not exist.
- **Crash-safe**: Logging failures are caught silently and never crash the Flask server.
- **Retraining-ready**: The logged inputs and labels can be loaded directly into a Pandas DataFrame for XGBoost retraining in Google Colab.

### Loading logs for retraining (example)

```python
import json, pandas as pd

with open('logs/predictions.json') as f:
    logs = json.load(f)

rows = []
for entry in logs:
    row = entry['inputs'].copy()
    row['top_crop'] = entry['predictions'][0]['crop']
    rows.append(row)

df = pd.DataFrame(rows)
print(df.head())
```

---

## 11. Future Scope

- **Automated retraining pipeline**: Use `logs/predictions.json` to periodically retrain the XGBoost model with fresh field data, improving accuracy over time.
- **Multi-sensor support**: Extend the ESP8266 firmware and sensor cache to handle multiple device IDs, mapping each to a specific field zone.
- **NPK IoT sensors**: Replace manual N/P/K input with real IoT soil nutrient sensors (e.g., SEN0232 or similar) for fully automated predictions.
- **Mobile app**: Wrap the prediction API in a React Native or Flutter app for farmers with limited web access.
- **Offline mode**: Cache the last successful prediction and weather data on the ESP8266 for use when WiFi connectivity is lost.
- **Yield forecasting**: Extend the ML pipeline with a regression model that predicts expected yield (tonnes/ha) given crop and conditions.
- **Alert system**: Add email/SMS notifications when sensor readings go out of safe range for a selected crop.
- **Dashboard analytics**: Build a charts view over historical `predictions.json` data to visualise crop recommendation trends by month and soil type.

---

**Happy Farming! 🌾🚜**

---

*CRS v2.0 — Built for EPICS Final Year Project*

Raw Inputs (5)

temperature — in °C, from DHT11 sensor or OpenWeather
humidity — relative humidity %, from DHT11 sensor or OpenWeather
rainfall — rainfall in mm, from OpenWeather (or manual override)
soil_type — label-encoded integer (0–6) from the CNN soil classifier
month — calendar month (1–12), entered by the farmer

Engineered Features (5)
6. temp_humidity — temperature × humidity / 100 (heat-moisture interaction)
7. hum_rain — humidity × log1p(rainfall) (moisture under rain stress)
8. moisture_index — (humidity + log1p(rainfall)) / 2 (overall soil moisture proxy)
9. month_sin — sin(2π × month / 12) (cyclic month encoding)
10. month_cos — cos(2π × month / 12) (cyclic month encoding)
