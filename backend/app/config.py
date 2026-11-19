"""Application settings, read once from environment variables (App Service app settings)."""
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
ON_APP_SERVICE = bool(os.environ.get("WEBSITE_SITE_NAME"))
# /home survives restarts and redeploys on App Service; wwwroot does not.
DATA_DIR = Path("/home/data") if ON_APP_SERVICE else BACKEND_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # Runtime
    app_env: str = "dev" if ON_APP_SERVICE else "local"  # local | dev | prod
    app_base_url: str = "http://localhost:5173"
    db_path: str = str(DATA_DIR / "po_intake.db")
    # Demo mode: sample lists and seeded fake requests. Emails are sent if GRAPH_* is configured, else written to an outbox folder.
    demo_mode: bool = False
    static_dir: str = str(BACKEND_DIR / "static")  # React build output

    # Auth. "easyauth" trusts App Service Easy Auth headers; "dev" fakes a user for local work.
    auth_mode: str = "easyauth"
    admin_role: str = "Admin"
    # Alternative to the app role: members of this Entra group (groups claim) are admins.
    azure_ad_admin_group_id: str = ""
    dev_user_email: str = "dev.user@ges.com"
    dev_user_name: str = "Dev User"
    dev_user_roles: str = "Admin"  # comma-separated

    # Microsoft Graph (app-only, client credentials)
    graph_app_id: str = ""
    graph_tenant_id: str = ""
    graph_client_secret: str = ""
    graph_shared_mailbox: str = ""  # sender: must be a real (user or shared) mailbox, not a distribution group
    email_to: str = ""  # recipient(s), comma-separated; may be a distribution group. Defaults to the sender.

    # Lists-of-values workbook in SharePoint (read via Graph, Sites.Selected)
    sp_site_url: str = ""  # e.g. https://contoso.sharepoint.com/sites/Purchasing
    sp_lists_path: str = ""  # path inside the site's default library, e.g. "PO Intake/PO Intake Lists.xlsx"
    local_lists_file: str = str(BACKEND_DIR / "sample_data" / "PO Intake Lists.xlsx")

    # Blob storage (managed identity). Empty -> local folder (dev only).
    blob_account_url: str = ""
    blob_attachments_container: str = "attachments"
    blob_backups_container: str = "backups"
    local_files_dir: str = str(DATA_DIR / "files")

    # Upload limits
    max_file_mb: int = 20
    max_files: int = 5

    # Scheduler (UTC hour for nightly jobs)
    scheduler_enabled: bool = True
    nightly_hour_utc: int = 9  # 1-2 AM Pacific

    @property
    def is_local(self) -> bool:
        return self.app_env == "local"

    @property
    def use_local_services(self) -> bool:
        """Sample lists + outbox email instead of SharePoint/Graph (local development or demo mode)."""
        return self.is_local or self.demo_mode

    @property
    def graph_configured(self) -> bool:
        return bool(self.graph_app_id and self.graph_tenant_id and self.graph_client_secret)

    @property
    def email_configured(self) -> bool:
        return self.graph_configured and bool(self.graph_shared_mailbox)

    @property
    def sharepoint_configured(self) -> bool:
        return self.graph_configured and bool(self.sp_site_url and self.sp_lists_path)


@lru_cache
def get_settings() -> Settings:
    return Settings()
