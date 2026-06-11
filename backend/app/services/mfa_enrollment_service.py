import logging

from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.services import (
    admin_transfer_service,
    mfa_recovery_service,
    mfa_service,
)

logger = logging.getLogger(__name__)

MFA_CONFIRMATION_ERROR = "Não foi possível confirmar a configuração MFA."
TRANSFER_COMPLETION_ERROR = (
    "Não foi possível concluir a transferência de administração."
)


def confirm_enrollment(
    user_id: int,
    code: str,
) -> tuple[bool, str, str | None]:
    completion = None
    has_pending_transfer = False
    recovery_code = None

    try:
        ok, message = mfa_service.apply_mfa_setup_confirmation(user_id, code)
        if not ok:
            db.session.rollback()
            return False, message, None

        recovery_code = mfa_recovery_service.apply_recovery_code(user_id)
        if recovery_code is None:
            db.session.rollback()
            return False, MFA_CONFIRMATION_ERROR, None

        has_pending_transfer = admin_transfer_service.has_pending_for_target(user_id)
        if has_pending_transfer:
            completion = admin_transfer_service.apply_pending_after_mfa(user_id)
            if completion is None:
                db.session.rollback()
                return False, TRANSFER_COMPLETION_ERROR, None

        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception(
            "Erro de base de dados ao confirmar MFA para o utilizador %s.",
            user_id,
        )
        error_message = (
            TRANSFER_COMPLETION_ERROR
            if has_pending_transfer
            else MFA_CONFIRMATION_ERROR
        )
        return False, error_message, None
    except Exception:
        db.session.rollback()
        raise

    if completion is not None:
        try:
            admin_transfer_service.notify_admin_transfer_completion(completion)
        except Exception:
            logger.exception(
                "Erro inesperado nos efeitos pós-transferência para o utilizador %s.",
                user_id,
            )

    return True, message, recovery_code
