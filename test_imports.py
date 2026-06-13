import os, sys
os.environ["KERAS_BACKEND"] = "torch"

steps = []
try:
    import keras
    steps.append("keras OK")
    from keras.applications import MobileNetV2
    steps.append("MobileNetV2 OK")
    from keras import layers, Model
    steps.append("layers/Model OK")
    from flask import Flask
    steps.append("Flask OK")
    import joblib, numpy, pandas
    steps.append("joblib/numpy/pandas OK")
    from PIL import Image
    steps.append("PIL OK")
    import xgboost
    steps.append("xgboost OK")
    steps.append("ALL IMPORTS PASSED")
except Exception as e:
    steps.append(f"FAILED: {e}")

for s in steps:
    print(s)

input("\nPress Enter to close...")
