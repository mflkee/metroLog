from pydantic import BaseModel


class HealthStatus(BaseModel):
    status: str
    service: str
    environment: str


class ReadinessStatus(BaseModel):
    status: str
    database: str
    redis: str

