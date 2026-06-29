from abc import ABC, abstractmethod

class Storage(ABC):
    @abstractmethod
    def put(self, path: str, data: bytes) -> str:
        """Saves data to target path and returns storage URI/path."""
        pass

    @abstractmethod
    def get(self, path: str) -> bytes:
        """Retrieves raw data by path."""
        pass

    @abstractmethod
    def url(self, path: str) -> str:
        """Returns public or local access URL to the file."""
        pass
