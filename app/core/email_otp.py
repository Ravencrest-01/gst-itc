"""
Real OTP email sender.  Drop this in at:  app/core/email_otp.py

It sends the OTP over SMTP using credentials from environment variables.
If SMTP isn't configured (e.g. local dev), it falls back to printing the
code to the console — so nothing breaks while developing.

Works with any SMTP provider (Brevo, Mailgun, SendGrid, Gmail, etc.).
Set these env vars in production:

    SMTP_HOST=smtp-relay.brevo.com
    SMTP_PORT=587
    SMTP_USER=your-smtp-login
    SMTP_PASS=your-smtp-key
    SMTP_FROM=no-reply@yourdomain.com      # a verified sender
"""
import os
import ssl
import smtplib
from email.message import EmailMessage


def send_otp_email(to_email: str, code: str) -> None:
    host = os.getenv("SMTP_HOST")

    # No SMTP configured -> dev fallback (prints to the server console)
    if not host:
        print(f"\n{'='*40}\nMock OTP for {to_email}: {code}\n{'='*40}\n")
        return

    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")
    sender = os.getenv("SMTP_FROM", user or "no-reply@localhost")

    msg = EmailMessage()
    msg["Subject"] = "Your verification code"
    msg["From"] = sender
    msg["To"] = to_email
    msg.set_content(
        f"Your ITC Reconciliation verification code is {code}.\n"
        f"It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email."
    )
    msg.add_alternative(
        f"""
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:440px;margin:auto">
          <h2 style="color:#1F4E79;margin:0 0 8px">Verify your email</h2>
          <p style="color:#444;font-size:14px">Use this code to finish signing up:</p>
          <div style="font-size:30px;font-weight:700;letter-spacing:6px;color:#1F4E79;
                      background:#EAF1F8;border-radius:10px;padding:16px;text-align:center">{code}</div>
          <p style="color:#888;font-size:12px;margin-top:14px">This code expires in 10 minutes.</p>
        </div>
        """,
        subtype="html",
    )

    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=15) as server:
        server.starttls(context=context)
        if user:
            server.login(user, password)
        server.send_message(msg)