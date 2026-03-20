import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.settings import AppSetting


async def get_smtp_config(db: AsyncSession):
    """Get SMTP configuration from app settings."""
    result = await db.execute(select(AppSetting).where(
        AppSetting.key.in_(['smtp_host', 'smtp_port', 'smtp_username', 'smtp_password',
                           'smtp_from_email', 'smtp_from_name', 'smtp_use_tls'])
    ))
    settings = {s.key: s.value for s in result.scalars().all()}

    if not settings.get('smtp_host') or not settings.get('smtp_from_email'):
        return None
    return settings


async def send_email(db: AsyncSession, to_email: str, subject: str, body_html: str,
                     attachment_data: bytes = None, attachment_name: str = None):
    """Send an email using configured SMTP settings."""
    config = await get_smtp_config(db)
    if not config:
        raise ValueError("Email not configured — set up SMTP in Settings > Accounting")

    msg = MIMEMultipart()
    msg['From'] = f"{config.get('smtp_from_name', 'Level Valley Farms')} <{config['smtp_from_email']}>"
    msg['To'] = to_email
    msg['Subject'] = subject

    msg.attach(MIMEText(body_html, 'html'))

    if attachment_data and attachment_name:
        part = MIMEBase('application', 'octet-stream')
        part.set_payload(attachment_data)
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', f'attachment; filename="{attachment_name}"')
        msg.attach(part)

    host = config['smtp_host']
    port = int(config.get('smtp_port', 587))
    use_tls = config.get('smtp_use_tls', 'true').lower() == 'true'

    with smtplib.SMTP(host, port) as server:
        if use_tls:
            server.starttls()
        username = config.get('smtp_username')
        password = config.get('smtp_password')
        if username and password:
            server.login(username, password)
        server.send_message(msg)

    return True
