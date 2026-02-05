from fastapi import APIRouter

from app.api.routes import (
    access_logs,
    api_assignments,
    clients,
    datasources,
    groups,
    login,
    macro_defs,
    modules,
    overview,
    permissions,
    private,
    roles,
    users,
    utils,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(datasources.router)
api_router.include_router(modules.router)
api_router.include_router(macro_defs.router)
api_router.include_router(groups.router)
api_router.include_router(api_assignments.router)
api_router.include_router(clients.router)
api_router.include_router(overview.router)
api_router.include_router(access_logs.router)
api_router.include_router(roles.router)
api_router.include_router(permissions.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
