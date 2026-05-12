import uuid
from datetime import datetime

from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    phone: str | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class WalletLookupRequest(BaseModel):
    email: str
    password: str


class UserWithWalletResponse(BaseModel):
    user_id: uuid.UUID
    wallet_id: uuid.UUID
    xrpl_address: str
    name: str
