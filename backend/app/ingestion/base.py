from abc import ABC, abstractmethod
from typing import Iterator
from app.schemas.contracts import InvoiceRecord

class LedgerSource(ABC):
    @abstractmethod
    def read_invoices(self) -> Iterator[InvoiceRecord]:
        """Parses records and yields frozen contract InvoiceRecords."""
        pass
