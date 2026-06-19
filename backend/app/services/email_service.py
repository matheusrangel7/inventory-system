from html import escape

from flask import current_app
from flask_mail import Message
from app.extensions import mail

_TEXT_FOOTER = "Este email foi enviado automaticamente pelo InvUBI."


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return "***"

    local_part, domain = email.rsplit("@", 1)
    if not local_part or not domain:
        return "***"

    visible = local_part[:2] if len(local_part) > 1 else local_part[:1]
    return f"{visible}***@{domain}"


def _send_message(msg: Message, event: str) -> bool:
    recipient = msg.recipients[0] if msg.recipients else ""
    if msg.body and not msg.body.rstrip().endswith(_TEXT_FOOTER):
        msg.body = f"{msg.body.rstrip()}\n\n{_TEXT_FOOTER}"

    try:
        mail.send(msg)
        return True
    except Exception as exc:
        current_app.logger.error(
            "Falha ao enviar email de %s para %s (%s).",
            event,
            _mask_email(recipient),
            type(exc).__name__,
        )
        return False


def _render_email_html(
    *,
    title: str,
    paragraphs: list[str],
    action_label: str | None = None,
    action_url: str | None = None,
    details: list[tuple[str, str]] | None = None,
    security_notice: str | None = None,
) -> str:
    paragraph_html = "".join(
        f'<p style="margin:0 0 16px;color:#1f2937;font-size:16px;line-height:24px;">'
        f"{escape(str(paragraph))}</p>"
        for paragraph in paragraphs
    )

    details_html = ""
    if details:
        rows = "".join(
            "<tr>"
            f'<td style="padding:8px 12px 8px 0;color:#374151;font-weight:700;vertical-align:top;">{escape(str(label))}</td>'
            f'<td style="padding:8px 0;color:#1f2937;vertical-align:top;">{escape(str(value))}</td>'
            "</tr>"
            for label, value in details
        )
        details_html = (
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
            'style="margin:0 0 20px;border-collapse:collapse;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;">'
            f'<tbody>{rows}</tbody></table>'
        )

    action_html = ""
    if action_label and action_url:
        safe_url = escape(action_url, quote=True)
        action_html = (
            '<p style="margin:0 0 20px;">'
            f'<a href="{safe_url}" style="display:inline-block;background:#2563eb;color:#ffffff;'
            'padding:12px 20px;border-radius:6px;font-size:16px;font-weight:700;text-decoration:none;">'
            f"{escape(action_label)}</a></p>"
            '<p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:20px;">'
            "Se o botão não funcionar, copie e cole este link no navegador:<br>"
            f'<a href="{safe_url}" style="color:#1d4ed8;word-break:break-all;">{safe_url}</a></p>'
        )

    notice_html = ""
    if security_notice:
        notice_html = (
            '<p style="margin:0 0 16px;padding:12px 14px;background:#fef2f2;color:#991b1b;'
            'border-left:4px solid #dc2626;font-size:14px;line-height:20px;">'
            f"{escape(security_notice)}</p>"
        )

    return (
        '<!doctype html><html lang="pt-PT"><body style="margin:0;padding:0;background:#f3f4f6;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;">'
        '<tr><td style="padding:32px 16px;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
        'style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">'
        '<tr><td style="padding:24px 32px;background:#1e3a8a;color:#ffffff;font-family:Arial,sans-serif;'
        'font-size:28px;font-weight:700;letter-spacing:1px;">InvUBI</td></tr>'
        '<tr><td style="padding:32px;font-family:Arial,sans-serif;">'
        f'<h1 style="margin:0 0 20px;color:#1e3a8a;font-size:24px;line-height:32px;">{escape(title)}</h1>'
        f"{paragraph_html}{details_html}{action_html}{notice_html}"
        '<p style="margin:24px 0 0;color:#6b7280;font-size:12px;line-height:18px;">'
        "Este email foi enviado automaticamente pelo InvUBI.</p>"
        '</td></tr></table></td></tr></table></body></html>'
    )


def send_registration_email(to_email: str, token: str) -> bool:
    base_url = (current_app.config.get("APP_BASE_URL") or "http://localhost").rstrip(
        "/"
    )
    link = f"{base_url}/primeiro-acesso?token={token}"

    msg = Message(
        subject="[InvUBI] Conclusão do registo",
        recipients=[to_email],
        # Corpo em texto simples (para clientes sem suporte HTML)
        body=(
            f"Foi criada uma conta para si no Sistema de Gestão de Inventário.\n\n"
            f"Para concluir o registo e definir a sua palavra-passe, aceda ao link:\n"
            f"{link}\n\n"
            f"Se não solicitou este acesso, ignore este email."
        ),
        html=_render_email_html(
            title="Concluir registo",
            paragraphs=[
                "Foi criada uma conta para si no Sistema de Gestão de Inventário.",
                "Para concluir o registo e definir a sua palavra-passe, utilize o botão abaixo.",
            ],
            action_label="Concluir registo",
            action_url=link,
            security_notice="Se não solicitou este acesso, ignore este email.",
        ),
    )

    return _send_message(msg, "registration")


def send_maintenance_alert_email(
    to_email: str,
    asset_id: int,
    serial_number: str,
    due_date_str: str,
) -> bool:
    subject = f"[InvUBI] Manutenção necessária - Ativo #{asset_id}"
    body_text = (
        f"O seguinte equipamento atingiu o prazo de manutenção:\n\n"
        f"ID do ativo: #{asset_id}\n"
        f"Nº de Série: {serial_number}\n"
        f"Estado atual: Necessita Manutenção\n"
        f"Data prevista: {due_date_str}\n\n"
        f"Por favor proceda à manutenção assim que possível e atualize o estado "
        f"no sistema de inventário.\n\n"
        f"Este email foi gerado automaticamente pelo InvUBI."
    )

    body_html = _render_email_html(
        title="Manutenção necessária",
        paragraphs=[
            "O seguinte equipamento atingiu o prazo de manutenção.",
            "Por favor proceda à manutenção assim que possível e atualize o estado no sistema de inventário.",
        ],
        details=[
            ("ID do ativo", f"#{asset_id}"),
            ("Nº de Série", serial_number or ""),
            ("Estado atual", "Necessita Manutenção"),
            ("Data prevista", due_date_str or ""),
        ],
    )

    msg = Message(
        subject=subject,
        recipients=[to_email],
        body=body_text,
        html=body_html,
    )

    return _send_message(msg, "maintenance_alert")


def send_admin_transfer_email(to_email: str) -> bool:
    subject = "[InvUBI] Foi promovido a Administrador"

    body_text = (
        "A sua conta no InvUBI foi promovida a Administrador.\n\n"
        "Já tem acesso completo ao sistema de inventário.\n"
        "Por favor faça login para continuar.\n\n"
        "Se não esperava este email, contacte o suporte."
    )

    body_html = _render_email_html(
        title="Promoção a administrador",
        paragraphs=[
            "A sua conta no InvUBI foi promovida a Administrador.",
            "Já tem acesso completo ao sistema de inventário. Por favor faça login para continuar.",
        ],
        security_notice="Se não esperava este email, contacte o suporte.",
    )

    msg = Message(
        subject=subject,
        recipients=[to_email],
        body=body_text,
        html=body_html,
    )

    return _send_message(msg, "admin_transfer_promotion")


def send_admin_demoted_email(to_email: str) -> bool:
    msg = Message(
        subject="[InvUBI] Alteração de perfil",
        recipients=[to_email],
        body=(
            "A sua conta no InvUBI passou de Administrador para Gestor.\n\n"
            "Por segurança, será necessário iniciar sessão novamente."
        ),
        html=_render_email_html(
            title="Alteração de perfil",
            paragraphs=[
                "A sua conta no InvUBI passou de Administrador para Gestor.",
                "Por segurança, será necessário iniciar sessão novamente.",
            ],
        ),
    )

    return _send_message(msg, "admin_transfer_demotion")


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
        html=_render_email_html(
            title="Recuperação de palavra-passe",
            paragraphs=[
                "Foi solicitada a recuperação da palavra-passe da sua conta no InvUBI.",
                "O link é válido durante 30 minutos e só pode ser utilizado uma vez.",
            ],
            action_label="Definir nova palavra-passe",
            action_url=link,
            security_notice="Se não efetuou este pedido, ignore este email.",
        ),
    )

    return _send_message(msg, "password_reset")


def send_password_reset_confirmation_email(to_email: str) -> bool:
    msg = Message(
        subject="[InvUBI] Palavra-passe redefinida",
        recipients=[to_email],
        body=(
            "A palavra-passe da sua conta InvUBI foi redefinida.\n\n"
            "Todas as sessões ativas foram encerradas. Inicie sessão novamente "
            "com a nova palavra-passe.\n\n"
            "Se não realizou esta alteração, contacte imediatamente o suporte."
        ),
        html=_render_email_html(
            title="Palavra-passe redefinida",
            paragraphs=[
                "A palavra-passe da sua conta InvUBI foi redefinida.",
                "Todas as sessões ativas foram encerradas. Inicie sessão novamente com a nova palavra-passe.",
            ],
            security_notice="Se não realizou esta alteração, contacte imediatamente o suporte.",
        ),
    )

    return _send_message(msg, "password_reset_confirmation")


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
        html=_render_email_html(
            title="Palavra-passe alterada",
            paragraphs=[
                "A palavra-passe da sua conta InvUBI foi alterada.",
                "Todas as sessões ativas foram encerradas. Inicie sessão novamente com a nova palavra-passe.",
            ],
            security_notice="Se não realizou esta alteração, contacte imediatamente o suporte.",
        ),
    )

    return _send_message(msg, "password_change_confirmation")


def send_recovery_email_changed_old_address(
    old_email: str,
    new_email: str,
) -> bool:
    msg = Message(
        subject="[InvUBI] Email da conta alterado",
        recipients=[old_email],
        body=(
            "O email de acesso à sua conta InvUBI foi alterado por um "
            "administrador.\n\n"
            f"Novo email: {new_email}\n\n"
            "Todas as sessões ativas foram encerradas. Se não reconhece esta "
            "alteração, contacte imediatamente o administrador."
        ),
        html=_render_email_html(
            title="Email da conta alterado",
            paragraphs=[
                "O email de acesso à sua conta InvUBI foi alterado por um administrador.",
                "Todas as sessões ativas foram encerradas.",
            ],
            details=[("Novo email", new_email)],
            security_notice="Se não reconhece esta alteração, contacte imediatamente o administrador.",
        ),
    )

    return _send_message(msg, "administrative_email_change_old_address")


def send_recovery_email_changed_new_address(
    new_email: str,
    old_email: str,
) -> bool:
    msg = Message(
        subject="[InvUBI] Novo email de acesso",
        recipients=[new_email],
        body=(
            "Este endereço passou a ser o email de acesso à sua conta InvUBI "
            "após uma recuperação administrativa.\n\n"
            f"Email anterior: {old_email}\n\n"
            "Todas as sessões ativas foram encerradas. Utilize este endereço "
            "no próximo login."
        ),
        html=_render_email_html(
            title="Novo email de acesso",
            paragraphs=[
                "Este endereço passou a ser o email de acesso à sua conta InvUBI após uma recuperação administrativa.",
                "Todas as sessões ativas foram encerradas. Utilize este endereço no próximo login.",
            ],
            details=[("Email anterior", old_email)],
        ),
    )

    return _send_message(msg, "administrative_email_change_new_address")


def send_administrative_mfa_reset_email(to_email: str) -> bool:
    msg = Message(
        subject="[InvUBI] Autenticador redefinido",
        recipients=[to_email],
        body=(
            "O autenticador da sua conta InvUBI foi redefinido por um "
            "administrador.\n\n"
            "Todas as sessões ativas foram encerradas. No próximo login será "
            "obrigatório configurar um novo autenticador.\n\n"
            "Se não reconhece esta ação, contacte imediatamente o administrador."
        ),
        html=_render_email_html(
            title="Autenticador redefinido",
            paragraphs=[
                "O autenticador da sua conta InvUBI foi redefinido por um administrador.",
                "Todas as sessões ativas foram encerradas. No próximo login será obrigatório configurar um novo autenticador.",
            ],
            security_notice="Se não reconhece esta ação, contacte imediatamente o administrador.",
        ),
    )

    return _send_message(msg, "administrative_mfa_reset")
