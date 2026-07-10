# ITC-Rec Engine Backend Implementation Plan

We will build the ITC-Rec Engine backend (FastAPI, PostgreSQL, SQLAlchemy) according to the provided Master Plan and Action Reference PDFs. Given the complexity of the system, we will execute this in **6 batches**, ensuring each module is fully functional, tested, and validated before moving to the next.

## User Review Required
- **Deployment Strategy**: The plan assumes the FastAPI backend will be deployed to **Render** (as a web service) and **NeonDB** for PostgreSQL, while the React frontend (which we will build separately or later) will be deployed to **Vercel**. 
- **Secret Management**: For local development, we will use a `.env` file. For production on Render, you will need to set these environment variables in the Render dashboard.
- **OTP Implementation**: For the MVP, should we implement a mock OTP service that logs the code to the console, or do you have a specific email provider (like SendGrid/Resend) you want to integrate immediately?
- **File Storage**: The uploaded PR and GSTR-2B files need to be stored. Should we store them locally for now and plan for AWS S3 / Cloudinary later, or do you want to integrate a cloud storage provider right away?

## Directory Structure
To ensure strict modularity and separation of concerns, the project will follow this structure:
```text
backend/
├── app/
│   ├── api/
│   │   ├── routers/       # API route definitions
│   │   └── dependencies/  # FastAPI dependencies (auth, db, etc.)
│   ├── core/              # Config, security, exceptions
│   ├── models/            # SQLAlchemy DB models
│   ├── schemas/           # Pydantic validation schemas
│   ├── services/          # Business logic and external integrations
│   └── main.py            # FastAPI application entry point
├── mock_data/             # JSON/CSV files for mock data (Strictly separate)
├── alembic/               # Database migration scripts
├── tests/                 # Unit and integration tests
├── .env                   # Environment variables
└── requirements.txt       # Dependencies
```

## Mock Data Strategy
All mock data required for development and testing will be placed in the `mock_data/` directory. 
- **No hardcoded mock data**: The main application code (`app/`) will *never* contain hardcoded mock data.
- **Dynamic Loading**: Services will read from `mock_data/` conditionally (e.g., when a specific environment variable like `USE_MOCK_DATA=true` is set) or test fixtures will inject this data. This ensures the production deployment to NeonDB and Render is completely free of mock artifacts.

## Proposed Changes

We will divide the backend development into the following logical batches. Each batch will include the API endpoints, Pydantic schemas, database models, and validation rules specified in the Action Reference.

### Batch 1: Setup & Platform Layer
*Initial project scaffolding, database setup, and core utilities.*
- **FastAPI Setup**: Initialize the app, configure CORS, exception handlers for canonical response envelopes (`{ detail: "message" }`), and routing structure (`app/api/routers/`).
- **Database Model Setup**: Configure SQLAlchemy to connect to NeonDB.
- **Alembic**: Initialize Alembic for database migrations.
- **Core Models**: Define all SQLAlchemy models (`workspace`, `subscription`, `user`, `client`, `client_allocation`, `vendor`, `gstn_credential`, `uploaded_file`, `reconciliation_run`, `purchase_invoice`, `portal_invoice`, `match_result`) using the exact canonical naming from §8.
- **Security**: Implement JWT authentication, password hashing (`pbkdf2_sha256`), and role-based dependency injections (e.g., `get_current_user`, `require_admin`).

### Batch 2: Identity & Subscription
*User authentication, profile management, firm member management, and workspace subscriptions.*
- **`app/api/routers/auth.py`**:
  - `POST /api/v1/auth/request-otp`
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/me`
  - `PATCH /api/v1/me`
  - `PATCH /api/v1/me/email`
  - `PUT /api/v1/me/avatar`
- **`app/api/routers/members.py`**:
  - `GET /api/v1/members`
  - `POST /api/v1/members`
  - `PATCH /api/v1/members/{id}/role`
  - `DELETE /api/v1/members/{id}`
- **`app/api/routers/subscription.py`**:
  - `GET / POST / PATCH /api/v1/workspace/subscription`

### Batch 3: Clients & Vendors
*Taxpayer company management and their vendor master lists.*
- **`app/api/routers/clients.py`**:
  - `GET /api/v1/clients`
  - `POST /api/v1/clients`
  - `GET /api/v1/clients/{id}`
  - `PATCH /api/v1/clients/{id}`
  - `DELETE /api/v1/clients/{id}`
  - `POST /api/v1/clients/{id}/allocations`
- **`app/api/routers/vendors.py`**:
  - `GET /api/v1/clients/{id}/vendors`
  - `POST /api/v1/clients/{id}/vendors`
  - `PATCH /api/v1/clients/{id}/vendors/{vendorId}`
  - `DELETE /api/v1/clients/{id}/vendors/{vendorId}`

### Batch 4: Files & Reconciliation Runs
*Uploading Purchase Registers / GSTR-2B files and initiating the matching engine.*
- **`app/api/routers/files.py`**:
  - `POST /api/v1/clients/{id}/files` (File upload and parsing)
  - `GET /api/v1/clients/{id}/files`
  - `GET /api/v1/files/{fileId}/download`
  - `DELETE /api/v1/files/{fileId}`
- **`app/api/routers/runs.py` (Core Engine Initiation)**:
  - `POST /api/v1/clients/{id}/runs` (Creates run, performs M1 normalization and M2 matching passes)
  - `GET /api/v1/clients/{id}/runs`
  - `GET /api/v1/runs/{id}/summary`
  - `GET /api/v1/runs/{id}/matches`

### Batch 5: Review & Reports
*Auditor review workflows, run lifecycle, and export generation.*
- **`app/api/routers/runs.py` (Review & Status)**:
  - `PATCH /api/v1/runs/{id}/matches/{matchId}` (Confirm/reject/skip)
  - `PATCH /api/v1/runs/{id}/status`
  - `DELETE /api/v1/runs/{id}`
- **`app/api/routers/reports.py`**:
  - `GET /api/v1/runs/{id}/reports/{type}` (Excel/CSV/PDF generation)
  - `GET /api/v1/runs/{id}/exports/tally`

### Batch 6: Integrations
*External system connectivity for Tally and GST portal.*
- **`app/api/routers/integrations.py`**:
  - `POST /api/v1/clients/{id}/tally/import`
  - `POST /api/v1/clients/{id}/gstn/credentials`
  - `POST /api/v1/clients/{id}/gstn/fetch-2b` (Background job simulation for MVP)
  - `GET /api/v1/gstn/jobs/{jobId}`

## Verification Plan

### Automated Tests
- We will write basic `pytest` unit tests for core utilities and models as they are developed.

### Manual Verification
- We will use a local PostgreSQL database to manually test API endpoints using FastAPI's built-in `/docs` Swagger UI.
- We will verify that data relationships (ER diagram) and constraints are strictly enforced via Alembic migrations.
- We will confirm that responses match the exact envelopes and snake_case naming conventions defined in the documentation.
