import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Create the core connection hub
engine = create_engine(DATABASE_URL)

# Create a factory for generating database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """ FastAPI Dependency: Opens a DB session per request and closes it when done. """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()