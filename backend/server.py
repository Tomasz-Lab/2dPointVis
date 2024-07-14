from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
import pandas as pd
from loguru import logger
import pymol2

DATA = pd.read_parquet("../../embeddings/all_clusters/embeddings/random_sampling/allrepr_normed.parquet")
DATA = DATA.sample(frac=1, random_state=42)
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

@app.get("/points_init")
async def points():
    subset_orig = DATA.sample(10000, random_state=42)

    return subset_orig.to_dict(orient="records")

@app.get("/points")
async def points(x0: float = -15, x1: float = 15, y0: float = -25, y1: float = 15, types: str = ""):
    types = types.split(",")
    subset = DATA[(DATA.x >= x0) & (DATA.x <= x1) & (DATA.y >= y0) & (DATA.y <= y1) & (DATA.type.isin(types))]
    if len(subset) > 1000:
        # get only top 1000
        subset = subset[:1000]

    return subset.to_dict(orient="records")

@app.get("/pdb/{pdb_id:path}", response_class=FileResponse)
async def pdb(pdb_id: str):
    pdb_id = pdb_id.replace("..", "")
    full_loc = PDB_LOC + pdb_id
    if full_loc.endswith(".pdb"):
        return full_loc

    elif full_loc.endswith(".cif"):
        with pymol2.PyMOL() as pymol:
            pymol.cmd.load(full_loc)
            pymol.cmd.save(full_loc + ".pdb")
        return full_loc + ".pdb"

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)