"""Service-to-service authentication.

apps/ai is internal-only: every non-health route requires a short-lived HS256 JWT signed by
apps/api with the shared SERVICE_JWT_SECRET. Deny by default (OWASP A01).
"""

from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.logging import log

# Tokens must expire quickly; reject anything valid for longer than this.
MAX_TOKEN_LIFETIME_SECONDS = 300

_bearer = HTTPBearer(auto_error=False)


def verify_service_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing service token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        log.warning("auth.missing_token")
        raise unauthorized
    try:
        claims: dict[str, Any] = jwt.decode(
            credentials.credentials,
            settings.service_jwt_secret.get_secret_value(),
            algorithms=["HS256"],  # pin the algorithm; never trust the token header
            audience=settings.service_jwt_audience,
            issuer=settings.service_jwt_issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=5,
        )
    except jwt.InvalidTokenError as exc:
        log.warning("auth.invalid_token", reason=type(exc).__name__)
        raise unauthorized from exc

    if claims["exp"] - claims["iat"] > MAX_TOKEN_LIFETIME_SECONDS:
        log.warning("auth.token_lifetime_too_long")
        raise unauthorized
    return claims


ServiceClaims = Annotated[dict[str, Any], Depends(verify_service_token)]
