"""Liveness and readiness probes. Unauthenticated, and they never reveal error details."""

from typing import Literal

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel

router = APIRouter(prefix="/health", tags=["health"])

ComponentStatus = Literal["up", "down"]


class Liveness(BaseModel):
    status: Literal["ok"]


class Readiness(BaseModel):
    status: Literal["ok", "degraded"]
    postgres: ComponentStatus
    mongo: ComponentStatus


@router.get("", response_model=Liveness)
async def liveness() -> Liveness:
    return Liveness(status="ok")


@router.get("/ready", response_model=Readiness)
async def readiness(request: Request, response: Response) -> Readiness:
    pg = await request.app.state.db.ping()
    mongo = await request.app.state.mongo.ping()
    ok = pg and mongo
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return Readiness(
        status="ok" if ok else "degraded",
        postgres="up" if pg else "down",
        mongo="up" if mongo else "down",
    )
