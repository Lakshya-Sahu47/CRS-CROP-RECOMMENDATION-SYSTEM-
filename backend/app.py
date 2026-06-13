"""
╔══════════════════════════════════════════════════════════════╗
║   IoT Crop Recommendation System  —  Flask Backend          ║
║   Inputs  : DHT11 via ESP8266 WiFi + OpenWeather API        ║
║   ML Model: XGBoost (with Optuna tuning)                    ║
║   Soil    : CNN MobileNetV2 (weights-only load)             ║
║   Output  : Top 3 crop recommendations + confidence         ║
╚══════════════════════════════════════════════════════════════╝
"""

import os
import io
import json
import sys

def _excepthook(exc_type, exc_value, exc_tb):
    import traceback
    print("\n[FATAL ERROR] App crashed during startup:", file=sys.stderr)
    traceback.print_exception(exc_type, exc_value, exc_tb)
    sys.exit(1)

sys.excepthook = _excepthook
import requests
import numpy as np
import pandas as pd
from datetime import datetime
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from PIL import Image

# ── ML / DL imports ───────────────────────────────────────────
import joblib

# Keras is optional — only needed for soil CNN and disease detection.
# If it fails to load (DLL crash, backend issue), the crop recommendation
# still works perfectly via XGBoost.
KERAS_AVAILABLE = False
keras = None
MobileNetV2 = None
layers = None
Model = None

try:
    os.environ["KERAS_BACKEND"] = "torch"
    import keras as _keras
    from keras.applications import MobileNetV2 as _MobileNetV2
    from keras import layers as _layers, Model as _Model
    keras       = _keras
    MobileNetV2 = _MobileNetV2
    layers      = _layers
    Model       = _Model
    KERAS_AVAILABLE = True
    print("[OK] Keras loaded successfully (torch backend)")
except Exception as e:
    print(f"[WARN] Keras unavailable — soil/disease models disabled: {e}")
    print("[INFO] Crop recommendation (XGBoost) will work normally.")

# ── Config ────────────────────────────────────────────────────
OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY", "YOUR_API_KEY_HERE")
CITY_NAME           = os.environ.get("CITY_NAME", "Bhopal")
COUNTRY_CODE        = os.environ.get("COUNTRY_CODE", "IN")

PROJECT_ROOT          = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MODEL_DIR             = os.path.join(PROJECT_ROOT, 'model')
CROP_AI_MODEL_DIR     = os.path.abspath(os.path.join(PROJECT_ROOT, '..', 'crop_ai', 'crop_ai'))
SOIL_WEIGHTS_PATH     = os.path.join(MODEL_DIR, 'soil_model_weights.weights.h5')
SOIL_CLASSES_PATH     = os.path.join(MODEL_DIR, 'class_indices.txt')
CROP_MODEL_PATH       = os.path.join(MODEL_DIR, 'model.pkl')
LABEL_ENCODER_PATH    = os.path.join(MODEL_DIR, 'label_encoder.pkl')
SOIL_ENCODER_PATH     = os.path.join(MODEL_DIR, 'soil_encoder.pkl')
FEATURE_COLS_PATH     = os.path.join(MODEL_DIR, 'feature_columns.pkl')
DISEASE_MODEL_FILES   = ('crop_disease_model.h5', 'disease_model.h5')
DISEASE_CLASS_FILES   = ('class_names.txt', 'disease_classes.txt')
DISEASE_INFO_FILES    = ('disease_info.json',)
DISEASE_ASSET_DIRS    = [MODEL_DIR, CROP_AI_MODEL_DIR]

IMG_SIZE = (224, 224)
NUM_SOIL_CLASSES = 7

# ── Flask App ─────────────────────────────────────────────────
app = Flask(
    __name__,
    template_folder=os.path.join(os.path.dirname(__file__), '..', 'frontend', 'templates'),
    static_folder=os.path.join(os.path.dirname(__file__),   '..', 'frontend', 'static'),
)
CORS(app)

# ── In-memory sensor store (updated by ESP8266 POST) ──────────
sensor_data = {
    "temperature": None,
    "humidity":    None,
    "timestamp":   None,
    "device_id":   None,
}

disease_runtime = {
    "model": None,
    "model_path": None,
    "class_path": None,
    "classes": [],
    "info": {},
}


def _find_existing_path(base_dirs, filenames):
    """Return the first file found across candidate directories."""
    for base_dir in base_dirs:
        if not base_dir or not os.path.isdir(base_dir):
            continue
        for filename in filenames:
            candidate = os.path.join(base_dir, filename)
            if os.path.exists(candidate):
                return candidate
    return None


def _load_class_names(class_path):
    classes = []
    if not class_path:
        return classes

    with open(class_path, encoding='utf-8') as f:
        for line in f:
            name = line.strip()
            if name:
                classes.append(name.split(',')[-1].strip())
    return classes


def _load_disease_info():
    """
    Merge disease metadata from crop_ai and CRS.
    crop_ai is used as the richer base dataset; CRS can still fill any gaps.
    """
    merged = {}

    for base_dir in (CROP_AI_MODEL_DIR, MODEL_DIR):
        if not os.path.isdir(base_dir):
            continue

        for filename in DISEASE_INFO_FILES:
            info_path = os.path.join(base_dir, filename)
            if not os.path.exists(info_path):
                continue

            with open(info_path, encoding='utf-8') as f:
                data = json.load(f)

            for disease_name, info in data.items():
                merged.setdefault(disease_name, {})
                for key, value in info.items():
                    if value and not merged[disease_name].get(key):
                        merged[disease_name][key] = value

    return merged


def _normalize_disease_name(name):
    return (
        (name or '')
        .strip()
        .lower()
        .replace(' ', '_')
        .replace('-', '_')
        .replace('___', '_')
        .replace('__', '_')
    )


def _lookup_disease_info(disease_info, disease_name):
    direct = disease_info.get(disease_name)
    if direct:
        return direct

    normalized = _normalize_disease_name(disease_name)
    for key, value in disease_info.items():
        if _normalize_disease_name(key) == normalized:
            return value

    return None


def get_disease_runtime(load_model=False):
    """Resolve disease assets from CRS/model or crop_ai and cache them."""
    if disease_runtime["model_path"] is None:
        disease_runtime["model_path"] = _find_existing_path(DISEASE_ASSET_DIRS, DISEASE_MODEL_FILES)

        preferred_dirs = []
        if disease_runtime["model_path"]:
            preferred_dirs.append(os.path.dirname(disease_runtime["model_path"]))
        for base_dir in DISEASE_ASSET_DIRS:
            if base_dir not in preferred_dirs:
                preferred_dirs.append(base_dir)

        disease_runtime["class_path"] = _find_existing_path(preferred_dirs, DISEASE_CLASS_FILES)
        disease_runtime["classes"] = _load_class_names(disease_runtime["class_path"])
        disease_runtime["info"] = _load_disease_info()

    if load_model and disease_runtime["model"] is None and disease_runtime["model_path"]:
        disease_runtime["model"] = keras.models.load_model(
            disease_runtime["model_path"],
            compile=False,
        )

    return disease_runtime

# ─────────────────────────────────────────────────────────────
#  MODEL LOADING
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
#  MODEL VARIABLES (populated by _load_all_models on startup)
# ─────────────────────────────────────────────────────────────
soil_model     = None
soil_class_map = {}
crop_model     = None
label_encoder  = None
soil_encoder   = None
feature_cols   = None
_models_loaded = False


def build_soil_model(num_classes=NUM_SOIL_CLASSES):
    if not KERAS_AVAILABLE:
        return None
    base_model = MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights=None)
    base_model.trainable = False
    inputs  = layers.Input(shape=(224, 224, 3))
    x       = base_model(inputs, training=False)
    x       = layers.GlobalAveragePooling2D()(x)
    x       = layers.BatchNormalization()(x)
    x       = layers.Dense(256, activation='relu')(x)
    x       = layers.Dropout(0.4)(x)
    x       = layers.Dense(128, activation='relu')(x)
    x       = layers.Dropout(0.3)(x)
    outputs = layers.Dense(num_classes, activation='softmax')(x)
    return Model(inputs=inputs, outputs=outputs, name='SoilClassifier_MobileNetV2')


def _load_all_models():
    global soil_model, soil_class_map, crop_model
    global label_encoder, soil_encoder, feature_cols, _models_loaded
    if _models_loaded:
        return

    print("\n" + "=" * 60)
    print("  CRS - Loading Models")
    print("=" * 60)

    # ── Soil CNN (only if Keras is available) ─────────────────
    if KERAS_AVAILABLE:
        if os.path.exists(SOIL_WEIGHTS_PATH):
            try:
                soil_model = build_soil_model()
                soil_model.load_weights(SOIL_WEIGHTS_PATH)
                print(f"  [OK] Soil CNN loaded: {SOIL_WEIGHTS_PATH}")
            except Exception as e:
                print(f"  [WARN] Soil CNN load failed: {e}")
        else:
            print(f"  [WARN] Soil weights not found: {SOIL_WEIGHTS_PATH}")

        if os.path.exists(SOIL_CLASSES_PATH):
            with open(SOIL_CLASSES_PATH, encoding='utf-8') as f:
                for line in f:
                    idx, cls = line.strip().split(',')
                    soil_class_map[int(idx)] = cls
            print(f"  [OK] Soil classes loaded: {soil_class_map}")
    else:
        print("  [SKIP] Soil CNN — Keras not available")

    # ── Crop XGBoost (always loaded — no Keras needed) ────────
    if os.path.exists(CROP_MODEL_PATH):
        crop_model = joblib.load(CROP_MODEL_PATH)
        print(f"  [OK] Crop XGBoost loaded: {CROP_MODEL_PATH}")
    else:
        print(f"  [WARN] Crop model not found: {CROP_MODEL_PATH}")

    if os.path.exists(LABEL_ENCODER_PATH):
        label_encoder = joblib.load(LABEL_ENCODER_PATH)
        print("  [OK] Label encoder loaded")
    else:
        print(f"  [WARN] Label encoder not found: {LABEL_ENCODER_PATH}")

    if os.path.exists(SOIL_ENCODER_PATH):
        soil_encoder = joblib.load(SOIL_ENCODER_PATH)
        print("  [OK] Soil encoder loaded")
    else:
        print(f"  [WARN] Soil encoder not found: {SOIL_ENCODER_PATH}")

    if os.path.exists(FEATURE_COLS_PATH):
        feature_cols = joblib.load(FEATURE_COLS_PATH)
        print(f"  [OK] Feature columns loaded: {feature_cols}")
    else:
        print(f"  [WARN] Feature columns not found: {FEATURE_COLS_PATH}")

    print("=" * 60 + "\n")
    _models_loaded = True


# ─────────────────────────────────────────────────────────────
#  HELPER FUNCTIONS
# ─────────────────────────────────────────────────────────────

def get_weather_from_openweather(city=None):
    """Fetch temperature, humidity, and rainfall from OpenWeather API."""
    try:
        query_city = city or CITY_NAME
        url = (
            f"https://api.openweathermap.org/data/2.5/weather"
            f"?q={query_city},{COUNTRY_CODE}&appid={OPENWEATHER_API_KEY}&units=metric"
        )
        resp = requests.get(url, timeout=5)
        data = resp.json()
        temperature = data.get('main', {}).get('temp', None)
        humidity    = data.get('main', {}).get('humidity', None)
        rainfall    = data.get('rain', {}).get('1h', 0.0)
        return (
            round(float(temperature), 1) if temperature is not None else None,
            round(float(humidity), 1)    if humidity    is not None else None,
            round(float(rainfall), 2),
        )
    except Exception as e:
        print(f"  [OpenWeather] Error: {e}")
        return None, None, 0.0


def predict_soil_type(image_bytes):
    """Run soil CNN on uploaded image bytes. Returns (soil_type, confidence)."""
    if soil_model is None:
        return "unknown", 0.0

    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img = img.resize(IMG_SIZE)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = np.expand_dims(arr, axis=0)

    preds   = soil_model.predict(arr, verbose=0)[0]
    top_idx = int(np.argmax(preds))

    soil_type  = soil_class_map.get(top_idx, "unknown")
    confidence = float(preds[top_idx])
    return soil_type, confidence


def encode_soil(soil_type_str):
    """Encode soil type using the fitted LabelEncoder from training."""
    if soil_encoder is None:
        # Fallback hardcoded map if encoder file missing
        fallback = {"alluvial": 0, "black": 1, "clay": 2,
                    "laterite": 3, "loamy": 4, "red": 5, "sandy": 6}
        return fallback.get(soil_type_str.lower(), -1)
    try:
        return int(soil_encoder.transform([soil_type_str.strip().lower()])[0])
    except Exception:
        return -1


def engineer_features(temperature, humidity, rainfall, soil_encoded, month):
    """
    Build feature vector — must match training notebook exactly.
    Features: temperature, humidity, rainfall, soil_type, month,
              temp_humidity, hum_rain, moisture_index, month_sin, month_cos
    """
    row = {
        'temperature'   : temperature,
        'humidity'      : humidity,
        'rainfall'      : rainfall,
        'soil_type'     : soil_encoded,
        'month'         : month,
        'temp_humidity' : temperature * humidity / 100,
        'hum_rain'      : humidity * np.log1p(rainfall),
        'moisture_index': (humidity + np.log1p(rainfall)) / 2,
        'month_sin'     : np.sin(2 * np.pi * month / 12),
        'month_cos'     : np.cos(2 * np.pi * month / 12),
    }

    # Use saved feature column order to guarantee correct ordering
    cols = feature_cols if feature_cols is not None else list(row.keys())
    return pd.DataFrame([row])[cols]


def predict_top3_crops(feature_df):
    """Return top-3 crop predictions with confidence and reason."""
    if crop_model is None or label_encoder is None:
        return [{"rank": 1, "crop": "Model not loaded", "confidence": 0.0,
                 "reason": "Place model.pkl and label_encoder.pkl in /model"}]

    proba   = crop_model.predict_proba(feature_df)[0]
    top3    = np.argsort(proba)[::-1][:3]
    classes = label_encoder.classes_

    results = []
    for rank, idx in enumerate(top3, start=1):
        results.append({
            "rank":       rank,
            "crop":       classes[idx],
            "confidence": round(float(proba[idx]) * 100, 1),
            "reason":     _build_reason(classes[idx], rank),
        })
    return results


CROP_REASONS = {
    "rice":        "High humidity and rainfall match rice's water requirements.",
    "wheat":       "Moderate temperature and low humidity suit wheat well.",
    "maize":       "Warm temperature and moderate rainfall are ideal for maize.",
    "cotton":      "High temperature and good drainage favour cotton.",
    "sugarcane":   "Tropical climate with high humidity suits sugarcane.",
    "jute":        "High rainfall and humidity are perfect for jute.",
    "coffee":      "Moderate temperature and high humidity match coffee.",
    "coconut":     "Warm coastal climate suits coconut palm.",
    "banana":      "Tropical temperature and humidity match banana.",
    "mango":       "Warm and dry conditions favour mango.",
    "apple":       "Cool temperature and low humidity suit apple.",
    "grapes":      "Warm dry climate is ideal for grapes.",
    "watermelon":  "High temperature and low humidity suit watermelon.",
    "muskmelon":   "Warm dry conditions are ideal for muskmelon.",
    "orange":      "Subtropical climate suits orange cultivation.",
    "papaya":      "Warm humid tropical climate suits papaya.",
    "pomegranate": "Hot dry climate favours pomegranate.",
    "chickpea":    "Cool dry conditions suit chickpea.",
    "lentil":      "Cool dry climate matches lentil requirements.",
    "blackgram":   "Warm humid conditions suit blackgram.",
    "mungbean":    "Warm humid tropical climate favours mungbean.",
    "mothbeans":   "Arid dry conditions favour mothbeans.",
    "pigeonpeas":  "Semi-arid warm climate suits pigeonpeas.",
    "kidneybeans": "Moderate temperature and humidity suit kidneybeans.",
}

def _build_reason(crop, rank):
    base   = CROP_REASONS.get(crop.lower(), "Environmental conditions are favourable.")
    suffix = {1: " (Best match)", 2: " (Good alternative)", 3: " (Possible option)"}
    return base + suffix.get(rank, "")


# ─────────────────────────────────────────────────────────────
#  ROUTES
# ─────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/sensor-data', methods=['POST'])
def receive_sensor_data():
    """
    Called by ESP8266 every 5 seconds with JSON:
    { "temperature": 27.3, "humidity": 65.0, "device_id": "ESP8266_CRS_01" }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    sensor_data['temperature'] = data.get('temperature')
    sensor_data['humidity']    = data.get('humidity')
    sensor_data['device_id']   = data.get('device_id', 'ESP8266')
    sensor_data['timestamp']   = datetime.now().isoformat()

    print(f"  [ESP8266] Temp={sensor_data['temperature']} C  "
          f"Humidity={sensor_data['humidity']}%  "
          f"@ {sensor_data['timestamp']}")

    return jsonify({"status": "ok", "received": data}), 200


@app.route('/api/live-sensor', methods=['GET'])
def get_live_sensor():
    """Frontend polls this to show live DHT11 readings."""
    return jsonify(sensor_data)


@app.route('/api/weather', methods=['GET'])
def get_weather():
    """Returns live weather from OpenWeather. Optional ?city= query param."""
    city = request.args.get('city', '').strip() or None
    temperature, humidity, rainfall = get_weather_from_openweather(city=city)
    return jsonify({
        "temperature": temperature,
        "humidity":    humidity,
        "rainfall_mm": rainfall,
        "city":        city or CITY_NAME,
    })


@app.route('/api/predict', methods=['POST'])
def predict():
    """
    Full prediction endpoint.

    Accepts multipart/form-data:
      - soil_image : image file (optional)
      - month      : int (1-12)

    Temperature + humidity : from ESP8266 sensor (falls back to OpenWeather)
    Rainfall               : from OpenWeather API
    Soil type              : from CNN on uploaded image
    """
    try:
        # ── 1. Soil type from image ───────────────────────────
        soil_type       = "unknown"
        soil_confidence = 0.0
        soil_source     = "not_provided"

        manual_soil = request.form.get('soil_type_manual', '').strip().lower()
        soil_file = request.files.get('soil_image')
        if manual_soil:
            soil_type = manual_soil
            soil_confidence = 1.0
            soil_source = "manual"
        elif soil_file and soil_file.filename:
            img_bytes = soil_file.read()
            soil_type, soil_confidence = predict_soil_type(img_bytes)
            soil_source = "cnn"

        # ── 2. Temperature + humidity (ESP8266 first, then OpenWeather) ──
        temperature = sensor_data.get('temperature')
        humidity    = sensor_data.get('humidity')

        city = request.form.get('city', '').strip() or None
        ow_temp, ow_hum, rainfall = get_weather_from_openweather(city=city)
        rainfall_source = "openweather"

        manual_rainfall = request.form.get('rainfall_manual', '').strip()
        if manual_rainfall:
            rainfall = float(manual_rainfall)
            rainfall_source = "manual"

        if temperature is None:
            temperature = ow_temp if ow_temp is not None else float(request.form.get('temperature', 25.0))
        if humidity is None:
            humidity = ow_hum if ow_hum is not None else float(request.form.get('humidity', 60.0))

        # ── 3. Month from farmer input ────────────────────────
        month = int(request.form.get('month', datetime.now().month))

        # ── 4. Feature engineering ────────────────────────────
        soil_encoded = encode_soil(soil_type)
        features     = engineer_features(temperature, humidity, rainfall,
                                         soil_encoded, month)

        # ── 5. Crop prediction ────────────────────────────────
        top3 = predict_top3_crops(features)

        return jsonify({
            "status": "success",
            "inputs": {
                "temperature":     temperature,
                "humidity":        humidity,
                "rainfall_mm":     rainfall,
                "rainfall_source": rainfall_source,
                "month":           month,
                "soil_type":       soil_type,
                "soil_source":     soil_source,
                "soil_confidence": round(soil_confidence * 100, 1),
            },
            "predictions": top3,
            "timestamp": datetime.now().isoformat(),
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/predict-soil', methods=['POST'])
def predict_soil_only():
    """Lightweight endpoint — just classify an uploaded soil image."""
    if 'soil_image' not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    img_bytes = request.files['soil_image'].read()
    soil_type, confidence = predict_soil_type(img_bytes)

    return jsonify({
        "soil_type":  soil_type,
        "confidence": round(confidence * 100, 1),
    })


@app.route('/api/status', methods=['GET'])
def status():
    disease_assets = get_disease_runtime(load_model=False)
    return jsonify({
        "soil_model_loaded":   soil_model is not None,
        "crop_model_loaded":   crop_model is not None,
        "disease_model_loaded": disease_assets["model_path"] is not None,
        "soil_encoder_loaded": soil_encoder is not None,
        "feature_cols_loaded": feature_cols is not None,
        "sensor_connected":    sensor_data['temperature'] is not None,
        "last_sensor_update":  sensor_data['timestamp'],
        "openweather_key_set": OPENWEATHER_API_KEY != "YOUR_API_KEY_HERE",
    })


@app.route('/api/predict-disease', methods=['POST'])
def predict_disease():
    """
    Crop disease detection from a leaf image.
    Model is loaded on-demand to avoid Keras version issues at startup.
    POST form-data: leaf_image (file)
    """
    if 'leaf_image' not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    disease_assets = get_disease_runtime(load_model=True)
    disease_model_path = disease_assets["model_path"]

    if not disease_model_path:
        return jsonify({
            "status":  "error",
            "message": (
                "Disease model not found. Place crop_disease_model.h5 in CRS/model "
                "or keep the crop_ai project at ../crop_ai/crop_ai."
            ),
        }), 503

    try:
        d_model = disease_assets["model"]
        disease_classes = disease_assets["classes"]
        disease_info = disease_assets["info"]

        # ── Run inference ─────────────────────────────────────────
        img_bytes = request.files['leaf_image'].read()
        img = Image.open(io.BytesIO(img_bytes)).convert('RGB').resize(IMG_SIZE)
        arr = np.array(img, dtype=np.float32) / 255.0
        arr = np.expand_dims(arr, axis=0)

        preds    = d_model.predict(arr, verbose=0)[0]
        top3_idx = np.argsort(preds)[::-1][:3]

        def _enrich(name, conf, rank):
            info = _lookup_disease_info(disease_info, name)
            entry = {
                "rank":       rank,
                "disease":    name,
                "confidence": round(float(conf) * 100, 1),
            }
            if info:
                entry["reason"]     = info.get("en_reason", "")
                entry["solution"]   = info.get("en_solution", "")
                entry["plant_need"] = info.get("plant_need", "")
            return entry

        results = []
        for rank, idx in enumerate(top3_idx, start=1):
            name = disease_classes[idx] if idx < len(disease_classes) else f"Class_{idx}"
            results.append(_enrich(name, preds[idx], rank))

        return jsonify({"status": "success", "predictions": results})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 60)
    print("  CRS - Flask Server Starting")
    print("  Listening for ESP8266 at /api/sensor-data")
    print("  Dashboard: http://localhost:5000")
    print(f"  Template folder : {app.template_folder}")
    print(f"  Static folder   : {app.static_folder}")
    print("=" * 60 + "\n")
    _load_all_models()
    # use_reloader=False prevents the silent-exit loop on Windows
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
