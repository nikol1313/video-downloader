from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from envpy import env

Base = declarative_base()

try:
    engine = create_engine(env.DATABASE)
    with engine.connect() as conn:
        conn.exec_driver_sql("SELECT 1")
except SQLAlchemyError as e:
    raise RuntimeError(f"Database connection failed: {e}")

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
