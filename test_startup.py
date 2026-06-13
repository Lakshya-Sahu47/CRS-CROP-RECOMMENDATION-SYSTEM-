"""
Mirrors app.py startup step by step to find exactly where it dies.
Run from your CRS folder: python test_startup.py
"""
import os, sys, traceback
os.environ["KERAS_BACKEND"] = "torch"

def step(msg):
    print(f"[ OK ] {msg}")
    sys.stdout.flush()

def die(msg, e):
    print(f"[FAIL] {msg}")
    traceback.print_exc()
    input("\nPress Enter to close...")
    sys.exit(1)

try:
    import io, json, requests, numpy as np, pandas as pd
    from datetime import datetime
    step("standard imports")
except Exception as e:
    die("standard imports", e)

try:
    from flask import Flask, request, jsonify, render_template
    from flask_cors import CORS
    step("flask imports")
except Exception as e:
    die("flask imports", e)

try:
    from PIL import Image
    import joblib
    import keras
    from keras.applications import MobileNetV2
    from keras import layers, Model
    step("keras/PIL/joblib imports")
except Exception as e:
    die("keras/PIL/joblib imports", e)

try:
    # Mirrors exactly what app.py does
    PROJECT_ROOT       = os.path.abspath(os.path.join(os.path.dirname(__file__), '.'))
    MODEL_DIR          = os.path.join(PROJECT_ROOT, 'model')
    TEMPLATE_FOLDER    = os.path.join(PROJECT_ROOT, 'frontend', 'templates')
    STATIC_FOLDER      = os.path.join(PROJECT_ROOT, 'frontend', 'static')

    print(f"       PROJECT_ROOT    : {PROJECT_ROOT}")
    print(f"       MODEL_DIR       : {MODEL_DIR}  exists={os.path.isdir(MODEL_DIR)}")
    print(f"       TEMPLATE_FOLDER : {TEMPLATE_FOLDER}  exists={os.path.isdir(TEMPLATE_FOLDER)}")
    print(f"       STATIC_FOLDER   : {STATIC_FOLDER}  exists={os.path.isdir(STATIC_FOLDER)}")
    step("path resolution")
except Exception as e:
    die("path resolution", e)

try:
    BACKEND_DIR    = os.path.join(PROJECT_ROOT, 'backend')
    app = Flask(
        "__main__",
        template_folder=os.path.join(BACKEND_DIR, '..', 'frontend', 'templates'),
        static_folder=os.path.join(BACKEND_DIR,   '..', 'frontend', 'static'),
    )
    CORS(app)
    step("Flask app created")
except Exception as e:
    die("Flask app creation", e)

try:
    SOIL_WEIGHTS_PATH = os.path.join(PROJECT_ROOT, 'model', 'soil_model_weights.weights.h5')
    print(f"       soil weights exists: {os.path.exists(SOIL_WEIGHTS_PATH)}")

    if os.path.exists(SOIL_WEIGHTS_PATH):
        base = MobileNetV2(input_shape=(224,224,3), include_top=False, weights=None)
        base.trainable = False
        inputs  = layers.Input(shape=(224,224,3))
        x       = base(inputs, training=False)
        x       = layers.GlobalAveragePooling2D()(x)
        x       = layers.Dense(7, activation='softmax')(x)
        model   = keras.Model(inputs=inputs, outputs=x)
        model.load_weights(SOIL_WEIGHTS_PATH)
        step("soil model loaded")
    else:
        step("soil model skipped (file not found — that is OK)")
except Exception as e:
    die("soil model loading", e)

try:
    CROP_MODEL_PATH    = os.path.join(PROJECT_ROOT, 'model', 'model.pkl')
    LABEL_ENCODER_PATH = os.path.join(PROJECT_ROOT, 'model', 'label_encoder.pkl')
    print(f"       crop model exists  : {os.path.exists(CROP_MODEL_PATH)}")
    print(f"       label encoder exists: {os.path.exists(LABEL_ENCODER_PATH)}")

    if os.path.exists(CROP_MODEL_PATH):
        crop_model = joblib.load(CROP_MODEL_PATH)
        step("crop XGBoost model loaded")
    else:
        step("crop model skipped (file not found)")

    if os.path.exists(LABEL_ENCODER_PATH):
        label_encoder = joblib.load(LABEL_ENCODER_PATH)
        step("label encoder loaded")
    else:
        step("label encoder skipped (file not found)")
except Exception as e:
    die("crop model loading", e)

print("\n" + "="*50)
print("ALL STARTUP STEPS PASSED")
print("The issue may be inside a route or a missing")
print("file that Flask needs at runtime.")
print("="*50)
input("\nPress Enter to close...")
