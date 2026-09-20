import os
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and "?schema=" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split("?")[0]

# Engine for pandas to read from
engine = create_engine(DATABASE_URL)
