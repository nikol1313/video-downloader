from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from envpy import env

engine = create_async_engine(env.DATABASE)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
