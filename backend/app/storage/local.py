import os
from app.storage.base import Storage

class LocalStorage(Storage):
    def __init__(self, base_dir: str = "./var/uploads"):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def put(self, path: str, data: bytes) -> str:
        full_path = os.path.join(self.base_dir, path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(data)
        return full_path

    def get(self, path: str) -> bytes:
        full_path = os.path.join(self.base_dir, path)
        with open(full_path, "rb") as f:
            return f.read()

    def url(self, path: str) -> str:
        return f"file://{os.path.abspath(os.path.join(self.base_dir, path))}"
