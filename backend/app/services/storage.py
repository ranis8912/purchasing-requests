"""File storage: Azure Blob (managed identity) in Azure, a local folder for local development."""
from functools import lru_cache
from pathlib import Path

from ..config import get_settings


@lru_cache
def _blob_service():
    from azure.identity import DefaultAzureCredential
    from azure.storage.blob import BlobServiceClient

    return BlobServiceClient(get_settings().blob_account_url, credential=DefaultAzureCredential())


def _local_path(container: str, name: str) -> Path:
    root = Path(get_settings().local_files_dir).resolve()
    path = (root / container / name).resolve()
    if root not in path.parents:
        raise ValueError("Invalid file path")
    return path


def put(container: str, name: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    if get_settings().blob_account_url:
        from azure.storage.blob import ContentSettings

        _blob_service().get_blob_client(container, name).upload_blob(
            data, overwrite=True, content_settings=ContentSettings(content_type=content_type)
        )
        return
    path = _local_path(container, name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def get(container: str, name: str) -> bytes:
    if get_settings().blob_account_url:
        return _blob_service().get_blob_client(container, name).download_blob().readall()
    return _local_path(container, name).read_bytes()
