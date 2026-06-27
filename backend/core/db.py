"""Database singleton (Motor / MongoDB)."""
import os
from motor.motor_asyncio import AsyncIOMotorClient

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

# Conveniencia para shutdown
def close():
    _client.close()
