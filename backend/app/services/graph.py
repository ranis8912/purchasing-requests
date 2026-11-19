"""Microsoft Graph client: app-only (client credentials) via MSAL, same pattern as Electrical Scheduling."""
import logging
from functools import lru_cache

import msal
import requests

from ..config import get_settings

log = logging.getLogger(__name__)
GRAPH = "https://graph.microsoft.com/v1.0"
TIMEOUT = 60


class GraphError(RuntimeError):
    pass


@lru_cache
def _msal_app() -> msal.ConfidentialClientApplication:
    s = get_settings()
    return msal.ConfidentialClientApplication(
        s.graph_app_id,
        authority=f"https://login.microsoftonline.com/{s.graph_tenant_id}",
        client_credential=s.graph_client_secret,
    )


def _token() -> str:
    # MSAL caches the token in memory and only calls Entra ID when it is close to expiry.
    result = _msal_app().acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
    if "access_token" not in result:
        raise GraphError(f"Graph token error: {result.get('error')}: {result.get('error_description')}")
    return result["access_token"]


def call(method: str, path_or_url: str, **kwargs) -> requests.Response:
    """Call Graph and raise GraphError with the response body on failure."""
    url = path_or_url if path_or_url.startswith("http") else f"{GRAPH}{path_or_url}"
    headers = {"Authorization": f"Bearer {_token()}", **kwargs.pop("headers", {})}
    resp = requests.request(method, url, headers=headers, timeout=TIMEOUT, **kwargs)
    if resp.status_code >= 400:
        raise GraphError(f"Graph {method} {url.split('?')[0]} -> {resp.status_code}: {resp.text[:500]}")
    return resp
