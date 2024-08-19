from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
import pandas as pd
from loguru import logger
import numpy as np

DATA = pd.read_csv("gemma.csv")
DATA = DATA.sample(frac=1, random_state=42)
DATA["length"] = DATA["text"].apply(lambda x: len(x.split()))

PDB_LOC = "/storage-local/dbs/mip-follow-up_clusters/struct/"

app = FastAPI()
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

@app.get("/languages")
async def languages():
    vals = DATA[["lang", "lang_color"]].values
    color_dict = {}
    for lang, color in vals:
        color_dict[lang] = color

    lang, color = zip(*sorted(color_dict.items(), key=lambda x: x[0]))

    return list(zip(lang, color))

@app.get("/lengths")
async def lengths():
    lengths = DATA["length"]
    return [int(lengths.min()), int(lengths.max())]

@app.get("/points_init")
async def points():
    subset_orig = DATA.sample(10000, random_state=42)

    return subset_orig.to_dict(orient="records")

@app.get("/points")
async def points(x0: float = -15, x1: float = 15, y0: float = -25, y1: float = 15, langs: str="", length: str=""):
    subset = DATA[(DATA.x >= x0) & (DATA.x <= x1) & (DATA.y >= y0) & (DATA.y <= y1)]
    if langs:
        langs = langs.split(",")
        subset = subset[subset.lang.isin(langs)]

    if length:
        length = length.split(",")
        subset = subset[(subset.length>=int(float(length[0]))) & (subset.length<=int(float(length[1])))]

    if len(subset) > 1000:
        # get only top 1000
        subset = subset[:1000]

    return subset.to_dict(orient="records")

@app.get("/text_search")
async def name_search(text: str):
    subset = DATA[DATA["text"].str.lower().str.contains(text.lower())][:10]
    return subset.to_dict(orient="records")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)