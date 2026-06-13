import os
os.environ["KERAS_BACKEND"] = "torch"
print("starting...")
from flask import Flask
app = Flask(__name__)

@app.route('/')
def hello():
    return "works"

print("running on http://localhost:5000")
app.run(port=5000, debug=False)