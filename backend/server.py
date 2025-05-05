from fastapi import FastAPI, WebSocket, WebSocketDisconnect, APIRouter
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
import pandas as pd
from loguru import logger
from cif_to_pdb import cif_to_pdb
import numpy as np
import json
import asyncio
import traceback
import os
import time
import concurrent.futures
from functools import lru_cache
import re
import tqdm


start_time = time.time()
DATA_FULL = pd.read_parquet(
    "/mnt/data/data.parquet"
).drop(columns=["afdb_hq"])
DATA_FULL["protein"] = list(DATA_FULL.index)
DATA = DATA_FULL.dropna(subset=["x", "y"])
DATA = DATA.rename(columns={"origin": "taxonomy_name", "database": "origin"})

logger.info(f"Taxonomy: {DATA['taxonomy'].value_counts()}")

logger.info(f"Loading main data took {time.time() - start_time:.2f}s ({len(DATA)} points)")

logger.info(f"Columns: {DATA.columns}")
logger.info(f"Data: {DATA.iloc[0]}")

DATA = DATA.sample(frac=1, random_state=42)
DATA.loc[
    (DATA["origin"] != "AFDB light clusters") & (DATA["origin"] != "AFDB dark clusters"),
    "afdb_pLDDT",
] = -1
DATA["clean_name"] = DATA["protein"].str.replace("AF-", "").str.replace("-model_v4", "").str.replace("-F1", "")
DATA["representative"] = DATA["clean_name"]

PDB_LOC = "/mnt/data/mip-follow-up_clusters/struct/"
GOTERM_LOC = "/mnt/data/deepfri_predictions_HQ"
PROTEIN_GOTERM_LOC = "/mnt/data/deepfri_predictions_protein_HQ"

start_time = time.time()
GOTERMS_NAME = pd.read_csv(
    "/mnt/data/gonames.csv", index_col=0
).rename(columns={"index": "GOterm"})
logger.info(f"Loading GO terms names took {time.time() - start_time:.2f}s")

start_time = time.time()
REPRESENTATIVE_MAPPING = pd.read_parquet(
    "/mnt/data/all_clusters_nf.parquet"
)
logger.info(f"Loading representative mapping took {time.time() - start_time:.2f}s")
REPRESENTATIVE_MAPPING["Protein"] = REPRESENTATIVE_MAPPING["Protein"].map(lambda x: json.loads(x))

start_time = time.time()
REVERSE_REPRESENTATIVE_MAPPING = REPRESENTATIVE_MAPPING.explode("Protein")
REVERSE_REPRESENTATIVE_MAPPING = pd.DataFrame.from_dict([
    {"Protein": protein, "Cluster": cluster}
    for protein, cluster in zip(REVERSE_REPRESENTATIVE_MAPPING["Protein"], REVERSE_REPRESENTATIVE_MAPPING.index)
]).set_index("Protein")
logger.info(f"Creating reverse mapping took {time.time() - start_time:.2f}s")

# Replace the slow initialization with a vectorized approach
start_time = time.time()
# Create dictionary mapping lowercase protein names to original indices
PROTEIN_INDEX_MAP = {name.lower(): name for name in REVERSE_REPRESENTATIVE_MAPPING.index}

# Create a precomputed lowercase version once
DATA['clean_name_lower'] = DATA['clean_name'].str.lower()

# Create mapping using a single vectorized operation
# Get all unique clusters in lowercase
unique_clusters = set(cluster.lower() for cluster in REPRESENTATIVE_MAPPING.index)

# Create lookup dict using vectorized operations
CLUSTER_TO_DATA = {}
# Get all matching rows in one operation
matching_mask = DATA['clean_name_lower'].isin(unique_clusters)
matching_data = DATA[matching_mask]
# Create the mapping dict directly
from tqdm import tqdm
CLUSTER_TO_DATA = {row['clean_name_lower']: row for _, row in tqdm(matching_data.iterrows(), desc="Building cluster to data mapping", total=len(matching_data))}

logger.info(f"Building search indices took {time.time() - start_time:.2f}s")

@lru_cache(maxsize=1000)
def search_proteins(search_term):
    """Cache protein name searches for better performance"""
    search_term_lower = search_term.lower()
    pattern = re.compile(search_term_lower)
    # Fast regex-based search through keys
    matching_keys = [key for key in PROTEIN_INDEX_MAP.keys() 
                     if pattern.search(key)]
    return matching_keys[:100]  # Limit to 100 matching proteins

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

api_router = APIRouter(prefix="/api")

def get_initial_points():
    start_time = time.time()
    subset_orig = DATA.sample(10000, random_state=42)
    logger.info(f"Initial points sampling took {time.time() - start_time:.2f}s")
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
    ontology: str="",
    taxonomy: str=""
):
    total_start_time = time.time()
    conditions = []
    if len(types) > 0:
        types = types.split(",")
        conditions.append(DATA["origin"].isin(types))
    
    if lengthRange:
        lengthRange = lengthRange.split(",")
        lengthRange = [int(lengthRange[0]), int(lengthRange[1])]
        conditions.append(
            (DATA.length >= lengthRange[0]) & (DATA.length <= lengthRange[1])
        )

    if pLDDT:
        pLDDT = pLDDT.split(",")
        pLDDT = [int(pLDDT[0]), int(pLDDT[1])]
        minus_one = DATA["afdb_pLDDT"] == -1
        larger = DATA["afdb_pLDDT"] <= pLDDT[1]
        smaller = DATA["afdb_pLDDT"] >= pLDDT[0]

        conditions.append((minus_one | (larger & smaller)))

    if supercog:
        supercog = supercog.split(",")
        conditions.append(DATA["superCOG_v10"].isin(supercog))
        
    if taxonomy:
        taxonomy_split = taxonomy.split(",")
        conditions.append(DATA["taxonomy"].isin(taxonomy_split))
        
    logger.info(f"Goterm: {goterm}, ontology: {ontology}, taxonomy: {taxonomy}")
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
        names = set(DATA["protein"])
        names = names.intersection(GOTERMS_CACHE[goterm])
        conditions.append(DATA["protein"].isin(names))
        logger.info(f"Intersection took {time.time() - intersect_time:.2f}s")
        logger.info(f"Total GO term processing took {time.time() - start_time:.2f}s")
        
    filter_start_time = time.time()
    mask = ((DATA.x >= x0) & (DATA.x <= x1) & (DATA.y >= y0) & (DATA.y <= y1))

    # Add all other conditions to the mask at once
    if conditions:
        for cond in conditions:
            mask &= cond
        
    subset = DATA[mask]
    logger.info(f"Initial spatial filtering took {time.time() - filter_start_time:.2f}s")
    
    if len(subset) > 1000:
        # get only top 1000
        subset = subset[:1000]
        
    logger.info(f"Total get_points processing took {time.time() - total_start_time:.2f}s with {len(subset)} results")
    return subset.to_dict(orient="records")


@api_router.get("/points_init")
async def points():
    return get_initial_points()


@api_router.get("/points")
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
    taxonomy: str = ""
):
    return get_points(x0, x1, y0, y1, types, lengthRange, pLDDT, supercog, goterm, ontology, taxonomy)

@api_router.get("/pdb_loc/{protein:str}")
async def pdb_loc(protein: str):
    # return DATA_FULL.loc[protein, "pdb_loc"]
    row = DATA_FULL[DATA_FULL["protein"] == protein]
    if len(row) == 0:
        return None
    return row["pdb_loc"].values[0]

@api_router.get("/pdb/{pdb_id:path}", response_class=FileResponse)
async def pdb(pdb_id: str):
    pdb_id = pdb_id.replace("..", "")
    full_loc = PDB_LOC + pdb_id
    if full_loc.endswith(".pdb"):
        return full_loc

    elif full_loc.endswith(".cif"):
        start_time = time.time()
        cif_to_pdb(full_loc, full_loc + ".pdb")
        logger.info(f"CIF to PDB conversion took {time.time() - start_time:.2f}s")
        return full_loc + ".pdb"

@api_router.get("/goterm/{protein:str}")
async def protein_goterm(protein: str):
    # Check for the protein in both DeepFRI 1.0 (main dataset) and 1.1 (new folds)
    protein_file = f"{PROTEIN_GOTERM_LOC}/{protein}.csv"
    
    if not os.path.exists(protein_file):
        logger.info(f"No GO term predictions found for protein: {protein}")
        return []
    
    try:
        # Read the GO term predictions for this protein
        start_time = time.time()
        goterms_df = pd.read_csv(protein_file)
        logger.info(f"Loading protein GO terms for {protein} took {time.time() - start_time:.2f}s")
        
        # Format the results to include GO term ID, ontology, name, and score
        format_start_time = time.time()
        results = []
        for _, row in goterms_df.iterrows():
            go_id = row.get("GO-term", "")
            ontology = row.get("Ontology", "")
            score = row.get("Score", 0)
            
            # Look up the GO term name if available
            go_name = ""
            if go_id in GOTERMS_NAME["GOterm"].values:
                go_name = GOTERMS_NAME.loc[GOTERMS_NAME["GOterm"] == go_id, "GOname"].values[0]
            
            results.append({
                "go_id": go_id,
                "ontology": ontology,
                "name": go_name,
                "score": score
            })
        
        # Sort by score (descending)
        results.sort(key=lambda x: x["score"], reverse=True)
        logger.info(f"Formatting GO terms data took {time.time() - format_start_time:.2f}s")
        return results
    
    except Exception as e:
        logger.error(f"Error reading GO terms for {protein}: {str(e)}")
        return {"error": f"Error processing GO terms: {str(e)}"}


@api_router.get("/name_search")
async def name_search(name: str):
    start_time = time.time()
    
    # Use cached regex search for faster matching
    matching_keys = search_proteins(name)
    
    if not matching_keys:
        return []
    
    # Get original indices
    original_indices = [PROTEIN_INDEX_MAP[key] for key in matching_keys[:10]]
    
    # Fast lookup using iloc
    all_matching = REVERSE_REPRESENTATIVE_MAPPING.loc[original_indices]
    logger.info(f"Finding matching names took {time.time() - start_time:.2f}s")
    
    processing_start_time = time.time()
    
    # Use precomputed data instead of filtering DATA again
    subset = []
    for found_name, cluster in zip(all_matching.index, all_matching["Cluster"]):
        cluster_lower = cluster.lower()
        if cluster_lower in CLUSTER_TO_DATA:
            data_ = CLUSTER_TO_DATA[cluster_lower].to_dict()
            data_["representative"] = cluster
            data_["protein"] = found_name
            other_protein_names = REPRESENTATIVE_MAPPING.loc[cluster, "Protein"]
            other_protein_urls = [DATA_FULL.loc[protein, "url"] for protein in other_protein_names]
            data_["others"] = [({"name": protein, "url": url} for protein, url in zip(other_protein_names, other_protein_urls))]
            subset.append(data_)
    
    logger.info(f"Processing matching names took {time.time() - processing_start_time:.2f}s")
    return subset


@api_router.get("/goterm_autocomplete")
async def goterm_autocomplete(goterm: str):
    start_time = time.time()
    subset = GOTERMS_NAME[
        GOTERMS_NAME["GOname"].str.lower().str.contains(goterm.lower())
    ][:10]
    logger.info(f"GO term autocomplete for '{goterm}' took {time.time() - start_time:.2f}s")
    return subset.to_dict(orient="records")

@api_router.websocket("/ws/points")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection established")

    try:
        while True:
            data = await websocket.receive_text()
            request_time = time.time()
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
                logger.info(f"WebSocket init request processed in {time.time() - request_time:.2f}s")
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
                        taxonomy=",".join(map(str, data.get("taxonomy", [])))
                    )
                    
                    if len(points) == 0:
                        await websocket.send_json({"type": "update", "points": [], "is_last": True})
                        logger.info(f"WebSocket query processed with no results in {time.time() - request_time:.2f}s")
                        continue

                    # Send points in batches of 100
                    send_start_time = time.time()
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
                    
                    logger.info(f"WebSocket query processed and sent {len(points)} points in {time.time() - request_time:.2f}s (sending took {time.time() - send_start_time:.2f}s)")

                except Exception as e:
                    logger.error(f"WebSocket query error: {e}")
                    await websocket.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        logger.error(traceback.format_exc())

app.include_router(api_router)

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        ws_max_size=1024 * 1024 * 10,  # 10MB max message size
        ws_ping_interval=None,  # Disable ping/pong
        ws_ping_timeout=None,
    )
