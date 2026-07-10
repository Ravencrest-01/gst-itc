import smtplib
from email.message import EmailMessage
from app.core.config import settings

def send_otp_email(to_email: str, otp_code: str, purpose: str = "registration"):
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        print(f"Mock sending OTP {otp_code} to {to_email} (SMTP not configured)")
        return
        
    msg = EmailMessage()
    msg['Subject'] = f"Your ITC-Rec Engine Verification Code"
    msg['From'] = settings.SMTP_FROM or settings.SMTP_USER
    msg['To'] = to_email
    
    if purpose == "registration":
        content = f"Welcome to ITC-Rec Engine!\n\nYour verification code is: {otp_code}\nThis code will expire in 10 minutes."
    else:
        content = f"Your verification code is: {otp_code}\nThis code will expire in 10 minutes."
        
    msg.set_content(content)
    
    try:
        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            server.starttls()
            
        server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.send_message(msg)
        server.quit()
    except Exception as e:
        print(f"Failed to send email: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to send email. Please check your SMTP configuration. Error: {str(e)}")
