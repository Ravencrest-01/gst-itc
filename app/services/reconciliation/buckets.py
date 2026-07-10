import enum

class BucketEnum(str, enum.Enum):
    matched = "matched"
    mismatched = "mismatched"
    missing_in_portal = "missing_in_portal"
    missing_in_books = "missing_in_books"
    probable = "probable"

class MatchPassEnum(str, enum.Enum):
    exact = "exact"
    normalized = "normalized"
    tolerance = "tolerance"
    fuzzy = "fuzzy"

class ReviewStatusEnum(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"
    skipped = "skipped"
