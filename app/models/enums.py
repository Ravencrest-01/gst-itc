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

class RoleEnum(str, enum.Enum):
    admin = "admin"
    member = "member"

class WorkspaceTypeEnum(str, enum.Enum):
    solo = "solo"
    firm = "firm"

class FileKindEnum(str, enum.Enum):
    purchase_register = "purchase_register"
    gstr_2b = "gstr_2b"

class RunStatusEnum(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"
