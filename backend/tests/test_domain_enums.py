from app.domain.enums import AdminTransferStatus, RegistrationStatus, UserRole
from app.models.user import User


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
