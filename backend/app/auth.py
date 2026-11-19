"""Current-user resolution from App Service Easy Auth.

Easy Auth signs users in before requests reach the app and injects X-MS-CLIENT-PRINCIPAL
(base64 JSON of the token claims). The platform strips any client-supplied X-MS-* headers,
so the header is trustworthy only when Easy Auth is enabled with "Require authentication".
"""
import base64
import json
import logging
import os
from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, Request, status

from .config import Settings, get_settings

log = logging.getLogger(__name__)

ROLE_CLAIMS = {"roles", "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"}
EMAIL_CLAIMS = (
    "preferred_username",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn",
    "email",
    "upn",
)


@dataclass(frozen=True)
class User:
    email: str
    name: str
    roles: frozenset[str] = field(default_factory=frozenset)
    is_admin: bool = False


def _parse_principal(header: str, admin_role: str, admin_group: str = "") -> User:
    data = json.loads(base64.b64decode(header + "=" * (-len(header) % 4)))
    role_typ = data.get("role_typ")
    claims: dict[str, list[str]] = {}
    for c in data.get("claims", []):
        claims.setdefault(c.get("typ", ""), []).append(c.get("val", ""))

    email = next((claims[k][0] for k in EMAIL_CLAIMS if claims.get(k)), "")
    name = (claims.get("name") or [email])[0]
    roles = frozenset(v for k, vals in claims.items() if k in ROLE_CLAIMS or k == role_typ for v in vals)
    in_admin_group = bool(admin_group) and admin_group in claims.get("groups", [])
    return User(email=email.lower(), name=name, roles=roles, is_admin=admin_role in roles or in_admin_group)


def get_current_user(request: Request, settings: Settings = Depends(get_settings)) -> User:
    if settings.auth_mode == "dev":
        # Never allow faked identities on App Service, whatever the settings say.
        if os.environ.get("WEBSITE_SITE_NAME"):
            log.error("AUTH_MODE=dev is not allowed on App Service")
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Authentication is misconfigured")
        roles = frozenset(r.strip() for r in settings.dev_user_roles.split(",") if r.strip())
        return User(settings.dev_user_email.lower(), settings.dev_user_name, roles, settings.admin_role in roles)

    header = request.headers.get("X-MS-CLIENT-PRINCIPAL")
    if not header:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    try:
        user = _parse_principal(header, settings.admin_role, settings.azure_ad_admin_group_id)
    except (ValueError, json.JSONDecodeError) as exc:
        log.warning("Bad X-MS-CLIENT-PRINCIPAL header: %s", exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in") from exc
    if not user.email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No email claim in sign-in token")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only")
    return user
