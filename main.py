import joblib
from fastapi import FastAPI
model = joblib.load('rf_best.pkl')

app = FastAPI()

@app.get('/')
def greed():
    return {'Welcome!'}