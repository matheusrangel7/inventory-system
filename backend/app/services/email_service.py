from flask import current_app
from flask_mail import Message
from app.extensions import mail

def send_registration_email(to_email: str, token: str) -> bool:
    base_url = (current_app.config.get("APP_BASE_URL") or "http://localhost").rstrip("/")
    link = f"{base_url}/primeiro-acesso?token={token}"

    msg = Message(
        subject="Conclusão do Registo — InvUBI (Sistema de inventário)",
        recipients=[to_email],
        # Corpo em texto simples (para clientes sem suporte HTML)
        body=(
            f"Foi criada uma conta para si no Sistema de Gestão de Inventário.\n\n"
            f"Para concluir o registo e definir a sua password, aceda ao link:\n"
            f"{link}\n\n"
            f"Se não solicitou este acesso, ignore este email."
        ),
        # Corpo HTML
        html=(
            f"<p>Foi criada uma conta para si no <strong>Sistema de Gestão de Inventário</strong>.</p>"
            f"<p>Para concluir o registo e definir a sua password, clique no botão abaixo:</p>"
            f'<p><a href="{link}" '
            f'style="background:#2563eb;color:white;padding:10px 20px;'
            f'text-decoration:none;border-radius:5px;">Concluir Registo</a></p>'
            f"<p>Ou copie o link: <code>{link}</code></p>"
            f"<small>Se não solicitou este acesso, ignore este email.</small>"
        ),
    )

    try:
        mail.send(msg)
        return True
    except Exception as e:
        current_app.logger.error(f"Erro ao enviar email para {to_email}: {e}")
        return False