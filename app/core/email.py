import smtplib
from email.message import EmailMessage
from app.core.config import settings

def send_otp_email(to_email: str, otp: str):
    """
    Sends an OTP email. If SMTP is not configured, logs to console for local dev.
    """
    if not settings.SMTP_SERVER or not settings.SMTP_PORT:
        # Console fallback
        print("="*40)
        print(f"DEVELOPMENT MODE: OTP Email Fallback")
        print(f"To: {to_email}")
        print(f"OTP: {otp}")
        print("="*40)
        return
        
    try:
        msg = EmailMessage()
        msg.set_content(f"Your ITC-Rec verification code is: {otp}\n\nThis code will expire in 10 minutes.")
        msg["Subject"] = "ITC-Rec Engine - Your Verification Code"
        msg["From"] = settings.SMTP_FROM_EMAIL or "noreply@itc-rec.local"
        msg["To"] = to_email
        
        server = smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT)
        server.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
    except Exception as e:
        print(f"Failed to send email via SMTP: {str(e)}")
        # Fallback to console on failure during dev
        print(f"FALLBACK OTP for {to_email}: {otp}")
