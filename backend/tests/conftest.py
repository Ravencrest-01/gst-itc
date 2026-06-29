import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.session import get_db
from app.models.base import Base
from app.models.models import Organization, AppUser
from app.core.security import get_password_hash, create_access_token
from app.main import app

# Use a separate testing database SQLite file in memory (or disk for simpler isolation)
# Actually, psycopg3 requires Postgres, but since our app has some postgres-specific parts (JSONB, etc.)
# We will use SQLite for testing if possible, OR run against the Postgres DB container if we have pg, or sqlite with compat.
# To keep test setup simple and not requiring Postgres running if ran in standalone environments, SQLite is typically fine,
# but we have Postgres JSONB in models. Let's configure a PostgreSQL testing database or mock it.
# Actually, since Docker-Compose will have PostgreSQL active, we can run against the dockerized postgres or a local postgres test database.
# Let's inspect env: in docker-compose, DATABASE_URL points to postgres. We can run tests using the environment's DATABASE_URL but override the session.
# Let's check settings.DATABASE_URL.
from app.core.config import settings

@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(settings.DATABASE_URL)
    # Ensure tables exist (normally we use alembic, but creating all tables directly in test DB is clean)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()

    yield session

    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def seeded_user(db_session):
    # Create org
    org = Organization(
        gstin="27AADCB8374D1Z2",
        legal_name="Test Organization"
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    # Create user
    user = AppUser(
        org_id=org.id,
        name="Test User",
        email="test@gstitc.com",
        password_hash=get_password_hash("testpassword"),
        role="admin"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture(scope="function")
def auth_headers(seeded_user):
    token = create_access_token(subject=seeded_user.id)
    return {"Authorization": f"Bearer {token}"}
