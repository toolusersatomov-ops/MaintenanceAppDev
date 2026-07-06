import os
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


def serialize(doc):
    """Strip Mongo's internal _id from a document dict. All our documents use
    a self-generated string `id` field, so nothing ObjectId ever needs to be
    returned to the client."""
    if not doc:
        return doc
    doc = dict(doc)
    doc.pop('_id', None)
    return doc


def serialize_list(docs):
    return [serialize(d) for d in docs]
