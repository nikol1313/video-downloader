from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.envpy import env

engine = create_async_engine(
    env.database_url,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args={"timeout": 30, "command_timeout": 30},
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
