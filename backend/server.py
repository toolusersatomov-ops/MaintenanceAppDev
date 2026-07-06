from fastapi import FastAPI
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from database import client
from seed import run_seed
from routers import auth, catalog, alerts, kitchen, operations, maintenance, admin, reports, supervisor

app = FastAPI(title="Protein Hulk Maintenance App")

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(alerts.router)
app.include_router(kitchen.router)
app.include_router(operations.router)
app.include_router(maintenance.router)
app.include_router(admin.router)
app.include_router(reports.router)
app.include_router(supervisor.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.get("/api")
async def root():
    return {"message": "Protein Hulk Maintenance App API"}


@app.on_event("startup")
async def startup_event():
    await run_seed()
    logger.info("Seed data ensured on startup")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
