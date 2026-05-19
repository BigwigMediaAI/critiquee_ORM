from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pathlib import Path
import os
import logging
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from database import db, client as mongo_client
from auth import hash_password, generate_business_key
from routes.auth_routes import router as auth_router
from routes.superadmin_routes import router as superadmin_router
from routes.review_routes import router as review_router
from routes.social_routes import router as social_router
from routes.department_routes import router as dept_router
from routes.ai_routes import router as ai_router
from routes.settings_routes import router as settings_router
from routes.reports_routes import router as reports_router
from routes.branch_routes import router as branch_router
from routes.platform_routes import router as platform_router
from routes.scheduled_posts_routes import router as scheduled_posts_router
from routes.sync_routes import router as sync_router
from routes.upload_routes import router as upload_router
from routes.seed_routes import router as seed_router
from routes.notification_routes import router as notification_router
from routes.gmb_routes import router as gmb_router
from routes.review_link_routes import router as review_link_router
from routes.event_routes import router as event_router
from routes.embed_routes import router as embed_router

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Critiquee API", version="1.0.0")

api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(superadmin_router, prefix="/super-admin", tags=["super-admin"])
api_router.include_router(review_router, prefix="/reviews", tags=["reviews"])
api_router.include_router(social_router, prefix="/social", tags=["social"])
api_router.include_router(dept_router, prefix="/departments", tags=["departments"])
api_router.include_router(ai_router, prefix="/ai", tags=["ai"])
api_router.include_router(settings_router, prefix="/settings", tags=["settings"])
api_router.include_router(reports_router, prefix="/reports", tags=["reports"])
api_router.include_router(branch_router, prefix="/branches", tags=["branches"])
api_router.include_router(platform_router, prefix="/platforms", tags=["platforms"])
api_router.include_router(scheduled_posts_router, prefix="/scheduled-posts", tags=["scheduled-posts"])
api_router.include_router(sync_router, prefix="/sync", tags=["sync"])
api_router.include_router(upload_router, prefix="/uploads", tags=["uploads"])
api_router.include_router(seed_router, prefix="/seed", tags=["seed"])
api_router.include_router(notification_router, prefix="/notifications", tags=["notifications"])
api_router.include_router(gmb_router, prefix="/gmb", tags=["google-my-business"])
api_router.include_router(review_link_router, prefix="/review-link", tags=["review-link"])
api_router.include_router(event_router, prefix="/events", tags=["events"])
api_router.include_router(embed_router, prefix="/embed", tags=["embed"])

@api_router.get("/health")
async def health():
    return {"status": "ok", "service": "Critiquee API"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def migrate_branches():
    """Migrate client.locations to branches collection and fix dept users."""
    clients = await db.clients.find({}).to_list(1000)
    for client in clients:
        client_id = client["id"]
        for loc in client.get("locations", []):
            existing = await db.branches.find_one({"id": loc["id"]})
            if not existing:
                await db.branches.insert_one({
                    "id": loc["id"],
                    "client_id": client_id,
                    "name": loc["name"],
                    "address": loc.get("address", ""),
                    "is_active": loc.get("is_active", True),
                    "brand_tone": client.get("brand_tone", "professional"),
                    "language": client.get("language", "English"),
                    "approval_required": client.get("approval_required", True),
                    "do_dont_rules": client.get("do_dont_rules", []),
                    "reply_templates": client.get("reply_templates", []),
                    "created_at": client.get("created_at"),
                })
                logger.info(f"Migrated branch {loc['name']} for client {client_id}")

    # Build branch lookup: client_id -> first branch id
    all_branches = await db.branches.find({}, {"_id": 0, "id": 1, "client_id": 1}).to_list(5000)
    branch_by_client = {}
    for b in all_branches:
        branch_by_client.setdefault(b["client_id"], b["id"])

    # Fix departments without location_id using bulk_write
    from pymongo import UpdateOne as PyUpdateOne
    depts_without_branch = await db.departments.find({"location_id": None}, {"_id": 0, "id": 1, "client_id": 1}).to_list(1000)
    dept_ops = [
        PyUpdateOne({"id": d["id"]}, {"$set": {"location_id": branch_by_client[d["client_id"]]}})
        for d in depts_without_branch if d.get("client_id") in branch_by_client
    ]
    if dept_ops:
        await db.departments.bulk_write(dept_ops)

    # Build dept lookup: dept_id -> branch_id
    all_depts = await db.departments.find({}, {"_id": 0, "id": 1, "location_id": 1}).to_list(5000)
    branch_by_dept = {d["id"]: d.get("location_id") for d in all_depts if d.get("location_id")}

    # Fix dept users without branch_id using bulk_write
    dept_users = await db.users.find({"role": "department", "branch_id": {"$exists": False}}, {"_id": 0, "id": 1, "department_id": 1}).to_list(1000)
    user_ops = [
        PyUpdateOne({"id": u["id"]}, {"$set": {"branch_id": branch_by_dept[u["department_id"]]}})
        for u in dept_users if u.get("department_id") in branch_by_dept
    ]
    if user_ops:
        await db.users.bulk_write(user_ops)

    # Fix platform_connections without branch_id using bulk_write
    connections = await db.platform_connections.find({"branch_id": {"$exists": False}}, {"_id": 0, "id": 1, "client_id": 1}).to_list(1000)
    conn_ops = [
        PyUpdateOne({"id": c["id"]}, {"$set": {"branch_id": branch_by_client[c["client_id"]]}})
        for c in connections if c.get("client_id") in branch_by_client
    ]
    if conn_ops:
        await db.platform_connections.bulk_write(conn_ops)

    logger.info("Branch migration completed")


async def migrate_business_keys():
    """Generate business_key for clients that don't have one."""
    clients = await db.clients.find({"business_key": {"$exists": False}}).to_list(1000)
    for client in clients:
        for _ in range(20):
            bkey = generate_business_key()
            if not await db.clients.find_one({"business_key": bkey}):
                break
        await db.clients.update_one({"id": client["id"]}, {"$set": {"business_key": bkey}})
        logger.info(f"Generated business key {bkey} for client '{client.get('name')}'")
    if clients:
        logger.info(f"Business key migration: {len(clients)} clients updated")


async def migrate_enabled_platforms():
    """Backfill enabled_platforms for existing clients with the latest platform catalog.
    Adds any new platforms missing from a client's enabled list. Never removes existing entries.
    """
    from routes.platform_routes import PLATFORM_CONFIGS
    all_platforms = list(PLATFORM_CONFIGS.keys())
    updated = 0
    cursor = db.clients.find({}, {"id": 1, "enabled_platforms": 1})
    async for client in cursor:
        existing = client.get("enabled_platforms") or []
        missing = [p for p in all_platforms if p not in existing]
        if missing:
            await db.clients.update_one(
                {"id": client["id"]},
                {"$set": {"enabled_platforms": list(existing) + missing}},
            )
            updated += 1
    if updated:
        logger.info(f"Enabled-platforms migration: {updated} client(s) extended with new platforms")


@app.on_event("startup")
async def startup():
    existing = await db.users.find_one({"role": "super_admin"})
    if not existing:
        super_admin = {
            "id": str(uuid.uuid4()),
            "email": "admin@handleey.com",
            "password_hash": hash_password("Handleey@2024"),
            "name": "Super Admin",
            "role": "super_admin",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(super_admin)
        logger.info("Super admin created: admin@handleey.com / Handleey@2024")
    else:
        logger.info("Super admin already exists")

    await migrate_branches()
    await migrate_business_keys()
    await migrate_enabled_platforms()

    # Ensure notification indexes
    await db.notifications.create_index([("user_id", 1), ("read", 1)])
    await db.notifications.create_index([("user_id", 1), ("branch_id", 1), ("created_at", -1)])

    # Start background scheduler for auto-publishing scheduled posts
    from scheduler import start_scheduler
    start_scheduler()


@app.on_event("shutdown")
async def shutdown():
    from scheduler import stop_scheduler
    stop_scheduler()
    mongo_client.close()
