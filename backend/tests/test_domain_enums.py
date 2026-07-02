from app.domain.enums import AdminTransferStatus, RegistrationStatus, UserRole
from app.models.user import User
from app.models.mfa_reconfiguration_request import MfaReconfigurationRequest
from app.models.admin_transfer import PendingAdminTransfer


def test_domain_enums_preserve_persisted_values():
    assert [role.value for role in UserRole] == ["Gestor", "Administrador"]
    assert [status.value for status in RegistrationStatus] == [
        "Pendente",
        "Concluído",
    ]
    assert [status.value for status in AdminTransferStatus] == [
        "Pendente",
        "Cancelada",
        "Expirada",
        "Concluída",
    ]


def test_user_model_uses_existing_postgresql_enum_values():
    assert User.__table__.c.role.type.enums == ["Gestor", "Administrador"]
    assert User.__table__.c.registration_status.type.enums == [
        "Pendente",
        "Concluído",
    ]
    assert User.__table__.c.mfa_recovery_code_hash.type.length == 255
    assert User.__table__.c.totp_secret_encrypted.type.length == 255


def test_admin_transfer_model_uses_existing_postgresql_enum_values():
    assert PendingAdminTransfer.__table__.c.status.type.enums == [
        "Pendente",
        "Cancelada",
        "Expirada",
        "Concluída",
    ]


def test_mfa_reconfiguration_model_has_one_pending_setup_per_user():
    table = MfaReconfigurationRequest.__table__
    assert table.c.user_id.unique
    assert not table.c.pending_totp_secret_encrypted.nullable
    assert table.c.pending_totp_secret_encrypted.type.length == 255
    assert not table.c.expires_at.nullable
