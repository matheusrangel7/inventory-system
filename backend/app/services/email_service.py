from html import escape

from flask import current_app
from flask_mail import Message
from app.extensions import mail


def send_registration_email(to_email: str, token: str) -> bool:
    base_url = (current_app.config.get("APP_BASE_URL") or "http://localhost").rstrip(
        "/"
    )
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


def send_maintenance_alert_email(
    to_email: str,
    asset_id: int,
    serial_number: str,
    due_date_str: str,
) -> bool:
    subject = f"[InvUBI] Manutenção Necessária - Asset #{asset_id}"
    serial_number_html = escape(serial_number or "")
    due_date_html = escape(due_date_str or "")

    body_text = (
        f"O seguinte equipamento atingiu o prazo de manutenção:\n\n"
        f"Asset ID: #{asset_id}\n"
        f"Nº de Série: {serial_number}\n"
        f"Estado atual: Necessita Manutenção\n"
        f"Data prevista: {due_date_str}\n\n"
        f"Por favor proceda à manutenção assim que possível e atualize o estado "
        f"no sistema de inventário.\n\n"
        f"Este email foi gerado automaticamente pelo InvUBI."
    )

    body_html = (
        f"<p>O seguinte equipamento atingiu o prazo de manutenção:</p>"
        f"<table style='border-collapse:collapse;font-family:sans-serif;'>"
        f"<tr><td style='padding:4px 12px 4px 0;font-weight:bold;'>Asset ID</td>"
        f"<td>#{asset_id}</td></tr>"
        f"<tr><td style='padding:4px 12px 4px 0;font-weight:bold;'>Nº de Série</td>"
        f"<td>{serial_number_html}</td></tr>"
        f"<tr><td style='padding:4px 12px 4px 0;font-weight:bold;'>Estado atual</td>"
        f"<td style='color:#b45309;font-weight:bold;'>Necessita Manutenção</td></tr>"
        f"<tr><td style='padding:4px 12px 4px 0;font-weight:bold;'>Data prevista</td>"
        f"<td>{due_date_html}</td></tr>"
        f"</table>"
        f"<p>Por favor proceda à manutenção assim que possível e atualize o estado "
        f"no <strong>sistema de inventário</strong>.</p>"
        f"<small style='color:#6b7280;'>Este email foi gerado automaticamente pelo InvUBI.</small>"
    )

    msg = Message(
        subject=subject,
        recipients=[to_email],
        body=body_text,
        html=body_html,
    )

    try:
        mail.send(msg)
        return True
    except Exception as ex:
        current_app.logger.error(
            f"Erro ao enviar alerta de manutenção para {to_email}: {ex}"
        )
        return False


def send_admin_transfer_email(to_email: str) -> bool:
    subject = "[InvUBI] Foi promovido a Administrador"

    body_text = (
        "A sua conta no InvUBI foi promovida a Administrador.\n\n"
        "Já tem acesso completo ao sistema de inventário.\n"
        "Por favor faça login para continuar.\n\n"
        "Se não esperava este email, contacte o suporte."
    )

    body_html = (
        "<p>A sua conta no <strong>InvUBI</strong> foi promovida a "
        "<strong>Administrador</strong>.</p>"
        "<p>Já tem acesso completo ao sistema de inventário.<br>"
        "Por favor faça login para continuar.</p>"
        "<p style='color:#6b7280;font-size:0.875rem;'>"
        "Se não esperava este email, contacte o suporte.</p>"
    )

    msg = Message(
        subject=subject,
        recipients=[to_email],
        body=body_text,
        html=body_html,
    )

    try:
        mail.send(msg)
        return True
    except Exception as exc:
        current_app.logger.error(f"Erro ao enviar email de transferência: {exc}")
        return False


def send_admin_demoted_email(to_email: str) -> bool:
    msg = Message(
        subject="[InvUBI] Alteração de perfil",
        recipients=[to_email],
        body=(
            "A sua conta no InvUBI passou de Administrador para Gestor.\n\n"
            "Por segurança, será necessário iniciar sessão novamente."
        ),
        html=(
            "<p>A sua conta no <strong>InvUBI</strong> passou de "
            "<strong>Administrador</strong> para <strong>Gestor</strong>.</p>"
            "<p>Por segurança, será necessário iniciar sessão novamente.</p>"
        ),
    )

    try:
        mail.send(msg)
        return True
    except Exception as exc:
        current_app.logger.error(f"Erro ao enviar email de rebaixamento: {exc}")
        return False


def send_password_reset_email(to_email: str, token: str) -> bool:
    base_url = (current_app.config.get("APP_BASE_URL") or "http://localhost").rstrip(
        "/"
    )
    link = f"{base_url}/redefinir-palavra-passe?token={token}"
    msg = Message(
        subject="[InvUBI] Recuperação de palavra-passe",
        recipients=[to_email],
        body=(
            "Foi solicitada a recuperação da palavra-passe da sua conta.\n\n"
            f"Defina uma nova palavra-passe através deste link:\n{link}\n\n"
            "O link é válido durante 30 minutos e só pode ser utilizado uma vez.\n"
            "Se não efetuou este pedido, ignore este email."
        ),
        html=(
            "<p>Foi solicitada a recuperação da palavra-passe da sua conta "
            "no <strong>InvUBI</strong>.</p>"
            f'<p><a href="{link}" '
            "style=\"background:#1e3a8a;color:white;padding:10px 20px;"
            "text-decoration:none;border-radius:5px;\">"
            "Definir nova palavra-passe</a></p>"
            "<p>O link é válido durante 30 minutos e só pode ser utilizado "
            "uma vez.</p>"
            "<small>Se não efetuou este pedido, ignore este email.</small>"
        ),
    )

    try:
        mail.send(msg)
        return True
    except Exception as exc:
        current_app.logger.error(
            f"Erro ao enviar email de recuperação para {to_email}: {exc}"
        )
        return False


def send_password_reset_confirmation_email(to_email: str) -> bool:
    msg = Message(
        subject="[InvUBI] Palavra-passe alterada",
        recipients=[to_email],
        body=(
            "A palavra-passe da sua conta InvUBI foi redefinida.\n\n"
            "Todas as sessões ativas foram encerradas. Inicie sessão novamente "
            "com a nova palavra-passe.\n\n"
            "Se não realizou esta alteração, contacte imediatamente o suporte."
        ),
        html=(
            "<p>A palavra-passe da sua conta <strong>InvUBI</strong> foi "
            "redefinida.</p>"
            "<p>Todas as sessões ativas foram encerradas. Inicie sessão "
            "novamente com a nova palavra-passe.</p>"
            "<p style='color:#991b1b;'>Se não realizou esta alteração, "
            "contacte imediatamente o suporte.</p>"
        ),
    )

    try:
        mail.send(msg)
        return True
    except Exception as exc:
        current_app.logger.error(
            f"Erro ao enviar confirmação de recuperação para {to_email}: {exc}"
        )
        return False


def send_password_change_confirmation_email(to_email: str) -> bool:
    msg = Message(
        subject="[InvUBI] Palavra-passe alterada",
        recipients=[to_email],
        body=(
            "A palavra-passe da sua conta InvUBI foi alterada.\n\n"
            "Todas as sessões ativas foram encerradas. Inicie sessão novamente "
            "com a nova palavra-passe.\n\n"
            "Se não realizou esta alteração, contacte imediatamente o suporte."
        ),
        html=(
            "<p>A palavra-passe da sua conta <strong>InvUBI</strong> foi "
            "alterada.</p>"
            "<p>Todas as sessões ativas foram encerradas. Inicie sessão "
            "novamente com a nova palavra-passe.</p>"
            "<p style='color:#991b1b;'>Se não realizou esta alteração, "
            "contacte imediatamente o suporte.</p>"
        ),
    )

    try:
        mail.send(msg)
        return True
    except Exception as exc:
        current_app.logger.error(
            f"Erro ao enviar confirmação de alteração para {to_email}: {exc}"
        )
        return False
