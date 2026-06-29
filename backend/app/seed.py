from app.db.session import SessionLocal
from app.models.models import Organization, AppUser
from app.core.security import get_password_hash
from app.core.config import settings

def seed_db():
    db = SessionLocal()
    try:
        # Check if organization exists
        org = db.query(Organization).first()
        if not org:
            org = Organization(
                gstin="27AADCB8374D1Z2",
                legal_name="Default Global Enterprises"
            )
            db.add(org)
            db.commit()
            db.refresh(org)
            print(f"Created default organization: {org.legal_name} (GSTIN: {org.gstin})")
        
        # Check if admin user exists
        admin = db.query(AppUser).filter(AppUser.email == settings.SEED_ADMIN_EMAIL).first()
        if not admin:
            admin = AppUser(
                org_id=org.id,
                name="System Administrator",
                email=settings.SEED_ADMIN_EMAIL,
                password_hash=get_password_hash(settings.SEED_ADMIN_PASSWORD),
                role="admin"
            )
            db.add(admin)
            db.commit()
            print(f"Created admin user: {admin.email}")
        else:
            print(f"Admin user {admin.email} already exists.")
            
    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
