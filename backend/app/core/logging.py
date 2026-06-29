import logging
import uuid
from contextvars import ContextVar
from typing import Any, Dict

correlation_id: ContextVar[str] = ContextVar("correlation_id", default="")

class CorrelationIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = correlation_id.get() or "none"
        return True

def setup_logging() -> None:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "correlation_id": "%(correlation_id)s", "message": "%(message)s"}'
    )
    handler.setFormatter(formatter)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers = []
    
    # Add correlation filter
    corr_filter = CorrelationIdFilter()
    handler.addFilter(corr_filter)
    
    root_logger.addHandler(handler)

def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
