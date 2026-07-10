from dataclasses import dataclass

@dataclass
class ReconciliationConfig:
    amount_tolerance_rupees: float = 1.0
    amount_tolerance_pct: float = 0.5
    fuzzy_name_threshold: int = 85
    date_day_first: bool = True
    max_upload_mb: int = 50
