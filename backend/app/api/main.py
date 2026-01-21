from fastapi import APIRouter

from app.api.routes import (
    api_assignments,
    alarm,
    clients,
    datasources,
    firewall,
    groups,
    items,
    login,
    modules,
    private,
    users,
    utils,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(datasources.router)
api_router.include_router(modules.router)
api_router.include_router(groups.router)
api_router.include_router(api_assignments.router)
api_router.include_router(clients.router)
api_router.include_router(firewall.router)
api_router.include_router(alarm.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
