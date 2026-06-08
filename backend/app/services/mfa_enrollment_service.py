from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.services import admin_transfer_service, mfa_service

TRANSFER_COMPLETION_ERROR = (
    "Não foi possível concluir a transferência de administração."
)


def confirm_enrollment(user_id: int, code: str) -> tuple[bool, str]:
    completion = None

    try:
        ok, message = mfa_service.apply_mfa_setup_confirmation(user_id, code)
        if not ok:
            db.session.rollback()
            return False, message

        if admin_transfer_service.has_pending_for_target(user_id):
            completion = admin_transfer_service.apply_pending_after_mfa(user_id)
            if completion is None:
                db.session.rollback()
                return False, TRANSFER_COMPLETION_ERROR

        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return False, TRANSFER_COMPLETION_ERROR
    except Exception:
        db.session.rollback()
        raise

    if completion is not None:
        admin_transfer_service.notify_admin_transfer_completion(completion)

    return True, message
