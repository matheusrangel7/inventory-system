from enum import StrEnum


class UserRole(StrEnum):
    MANAGER = "Gestor"
    ADMINISTRATOR = "Administrador"


class RegistrationStatus(StrEnum):
    PENDING = "Pendente"
    COMPLETED = "Concluído"


class AdminTransferStatus(StrEnum):
    PENDING = "Pendente"
    CANCELLED = "Cancelada"
    EXPIRED = "Expirada"
    COMPLETED = "Concluída"
