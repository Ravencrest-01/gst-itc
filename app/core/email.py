import smtplib
from email.message import EmailMessage
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

def send_otp_email(to_email: str, otp: str):
    """
    Sends an OTP email. If SMTP is not configured, logs to console for local dev.
    """
    if not settings.SMTP_HOST or not settings.SMTP_PORT:
        logger.warning(f"Mock email: [{to_email}] OTP is {otp}")
        return
        
    msg = EmailMessage()
    msg.set_content(f"Your ITC-Rec Engine verification code is: {otp}")
    msg["Subject"] = "Your Verification Code"
    msg["From"] = settings.SMTP_FROM or "noreply@itc-rec.test"
    msg["To"] = to_email
    
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            if settings.SMTP_USER and settings.SMTP_PASS:
                server.login(settings.SMTP_USER, settings.SMTP_PASS)
            server.send_message(msg)
    except Exception as e:
        print(f"Failed to send email via SMTP: {str(e)}")
        # Fallback to console on failure during dev
        print(f"FALLBACK OTP for {to_email}: {otp}")
