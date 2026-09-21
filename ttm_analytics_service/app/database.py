import os
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()

def get_cleaned_database_url() -> str:
    raw_url = os.getenv("DATABASE_URL", "")
    if not raw_url:
        return ""

    # SQLAlchemy 2.0 requires 'postgresql://' instead of legacy 'postgres://'
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql://", 1)

    parsed = urlparse(raw_url)
    
    # Filter out parameters that psycopg2 rejects (such as 'schema')
    # but preserve critical cloud parameters like 'sslmode=require'
    filtered_params = [
        (k, v) for k, v in parse_qsl(parsed.query) 
        if k.lower() not in ("schema",)
    ]

    cleaned_url = urlunparse((
        parsed.scheme,
        parsed.netloc,
        parsed.path,
        parsed.params,
        urlencode(filtered_params),
        parsed.fragment
    ))
    return cleaned_url

DATABASE_URL = get_cleaned_database_url()

# Engine for Pandas and SQLAlchemy with connection pre-ping for cloud DBs
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)
