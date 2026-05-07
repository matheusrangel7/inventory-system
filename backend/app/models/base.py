from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    Classe base para todos os modelos SQLAlchemy.
    Com o Flask-SQLAlchemy-Lite, passamos esta classe no init_app()
    em vez de usar db.Model diretamente.
    """
    pass