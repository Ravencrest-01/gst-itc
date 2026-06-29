# GST Input-Tax-Credit Reconciliation Engine (M0 Foundation)

This is the M0 foundation skeleton for the GST ITC Reconciliation engine. It implements a modular monolith structure using FastAPI, SQLAlchemy, PostgreSQL, and a Vite+React frontend. 

## Tech Stack
- **Backend:** Python 3.12, FastAPI, Uvicorn
- **Database:** PostgreSQL 16, SQLAlchemy 2.0 (SYNC), Alembic
- **Validation:** Pydantic v2
- **Auth (Stub):** PyJWT, Passlib (bcrypt)
- **Frontend:** React + Vite + TypeScript
- **Infra:** Docker & Docker Compose

## Setup Instructions

### 1. Environment Configuration
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
The `.env.example` lists all required environment variables:
- `ENVIRONMENT` (e.g., dev)
- `DATABASE_URL` (PostgreSQL connection string)
- `SECRET_KEY` (JWT signing key)
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `SEED_ADMIN_EMAIL` (Initial admin user)
- `SEED_ADMIN_PASSWORD`

### 2. Start Services
Bring up the PostgreSQL database and FastAPI backend using Docker Compose:
```bash
docker compose up -d
```

### 3. Database Setup & Seeding
Once the services are running, apply the database migrations and seed the initial organization and admin user:
```bash
# Apply migrations (run inside the backend directory if using virtualenv, or inside docker)
cd backend
alembic upgrade head

# Seed the database
python -m app.seed
```

### 4. API Verification
Verify the backend health:
```bash
curl http://localhost:8000/health
```
You should see a 200 OK response with the database status as "connected".

### 5. Running Tests
Tests are configured using `pytest` and `httpx`. From the `backend` directory, run:
```bash
pytest
```
This tests the health check, the frozen contract validations (InvoiceRecord & MatchResultRecord), and the run creation/reconciliation flow.

### 6. Frontend Setup
Navigate to the frontend directory, install dependencies, and run the development server:
```bash
cd frontend
npm install
npm run dev
```
Open your browser to the local Vite URL (typically `http://localhost:5173`) to see the health dashboard.
