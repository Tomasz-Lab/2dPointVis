from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
import pandas as pd
from loguru import logger
import pymol2
import numpy as np
import json
import asyncio
import traceback
import os
import time


DATA = pd.read_parquet(
    "../../embeddings/all_clusters/embeddings/random_sampling/allrepr_normed.parquet"
)
DATA = DATA.sample(frac=1, random_state=42)
DATA.loc[
    (DATA["type"] != "afdb-clusters-light") & (DATA["type"] != "afdb-clusters-dark"),
    "pLDDT (AF)",
] = -1

PDB_LOC = "/storage-local/dbs/mip-follow-up_clusters/struct/"
GOTERM_LOC = "/storage-matrix-old/dark_uhgp/webserver/deepfri_predictions_HQ"

GOTERMS_NAME = pd.read_csv(
    "/storage-matrix-old/dark_uhgp/webserver/gonames.csv", index_col=0
)

GOTERMS_CACHE = {}

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


def get_initial_points():
    subset_orig = DATA.sample(10000, random_state=42)
    return subset_orig.to_dict(orient="records")


def get_points(
    x0: float = -15,
    x1: float = 15,
    y0: float = -25,
    y1: float = 15,
    types: str = "",
    lengthRange: str = "",
    pLDDT: str = "",
    supercog: str = "",
    goterm: str = "",
    ontology: str=""
):
    conditions = []
    if len(types) > 0:
        types = types.split(",")
        conditions.append(DATA["type"].isin(types))
    
    if lengthRange:
        lengthRange = lengthRange.split(",")
        lengthRange = [int(lengthRange[0]), int(lengthRange[1])]
        conditions.append(
            (DATA.Length >= lengthRange[0]) & (DATA.Length <= lengthRange[1])
        )

    if pLDDT:
        pLDDT = pLDDT.split(",")
        pLDDT = [int(pLDDT[0]), int(pLDDT[1])]
        minus_one = DATA["pLDDT (AF)"] == -1
        larger = DATA["pLDDT (AF)"] <= pLDDT[1]
        smaller = DATA["pLDDT (AF)"] >= pLDDT[0]

        conditions.append((minus_one | (larger & smaller)))

    if supercog:
        supercog = supercog.split(",")
        conditions.append(DATA["SuperCOGs_str_v10"].isin(supercog))
        
    logger.info(f"Goterm: {goterm}, ontology: {ontology}")
    if goterm:
        start_time = time.time()
        
        if not ontology:
            ontology = "BP"
        
        goterm_loc = f"{GOTERM_LOC}/{ontology}/{goterm}.csv"
        if not os.path.exists(goterm_loc):
            logger.info(f"File check took {time.time() - start_time:.2f}s")
            return []
        
        cache_time = time.time()
        if goterm not in GOTERMS_CACHE:
            goterm_df = pd.read_csv(goterm_loc)
            GOTERMS_CACHE[goterm] = set(goterm_df["Protein"].tolist())
            logger.info(f"Loading GO term data took {time.time() - cache_time:.2f}s")
            
        intersect_time = time.time()
        names = set(DATA["name"])
        names = names.intersection(GOTERMS_CACHE[goterm])
        conditions.append(DATA["name"].isin(names))
        logger.info(f"Intersection took {time.time() - intersect_time:.2f}s")
        logger.info(f"Total GO term processing took {time.time() - start_time:.2f}s")
        
    subset = DATA[
        (DATA.x >= x0)
        & (DATA.x <= x1)
        & (DATA.y >= y0)
        & (DATA.y <= y1)
    ]
    
    for cond in conditions:
        subset = subset[cond]
    if len(subset) > 1000:
        # get only top 1000
        subset = subset[:1000]

    return subset.to_dict(orient="records")


@app.get("/points_init")
async def points():
    return get_initial_points()


@app.get("/points")
async def points(
    x0: float = -15,
    x1: float = 15,
    y0: float = -25,
    y1: float = 15,
    types: str = "",
    lengthRange: str = "",
    pLDDT: str = "",    
    supercog: str = "",
    goterm: str = "",
    ontology: str = "",
):
    return get_points(x0, x1, y0, y1, types, lengthRange, pLDDT, supercog, goterm, ontology)


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


@app.get("/name_search")
async def name_search(name: str):
    subset = DATA[DATA["name"].str.lower().str.contains(name.lower())][:10]
    subset["name"] = (
        subset["name"]
        .str.replace("AF-", "")
        .str.replace("-model_v4", "")
        .str.replace("-F1", "")
    )
    return subset.to_dict(orient="records")


@app.get("/goterm_autocomplete")
async def goterm_autocomplete(goterm: str):
    subset = GOTERMS_NAME[
        GOTERMS_NAME["GOname"].str.lower().str.contains(goterm.lower())
    ][:10]
    return subset.to_dict(orient="records")


@app.websocket("/ws/points")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_text()
            data = json.loads(data)

            if data.get("type") == "init":
                # Handle initial data load - these points stay permanently
                points = get_initial_points()
                await websocket.send_json(
                    {
                        "type": "init",
                        "points": points,
                    }
                )
            else:
                # Handle regular point queries - these points get updated
                try:
                    points = get_points(
                        x0=float(data.get("x0", -15)),
                        x1=float(data.get("x1", 15)),
                        y0=float(data.get("y0", -25)),
                        y1=float(data.get("y1", 15)),
                        types=",".join(data.get("types", [])),
                        lengthRange=",".join(map(str, data.get("lengthRange", []))),
                        pLDDT=",".join(map(str, data.get("pLDDT", []))),
                        supercog=",".join(map(str, data.get("supercog", []))),
                        goterm=data.get("goTerm", ""),
                        ontology=data.get("ontology", ""),
                    )
                    
                    if len(points) == 0:
                        await websocket.send_json({"type": "update", "points": [], "is_last": True})
                        continue

                    # Send points in batches of 100
                    for i in range(0, len(points), 100):
                        batch = points[i : i + 100]
                        await websocket.send_json(
                            {
                                "type": "update",
                                "points": batch,
                                "is_last": i + 100 >= len(points),
                            }
                        )
                        await asyncio.sleep(0.01)  # Small delay between batches

                except Exception as e:
                    await websocket.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        logger.error(traceback.format_exc())


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        ws_max_size=1024 * 1024 * 10,  # 10MB max message size
        ws_ping_interval=None,  # Disable ping/pong
        ws_ping_timeout=None,
    )
