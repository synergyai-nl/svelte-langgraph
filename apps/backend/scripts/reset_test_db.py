"""Drop and recreate the E2E test database named by TEST_DATABASE_URL.

Run before starting the E2E backend so every run begins from an empty
database (Aegra applies its migrations on startup). Works against any
reachable PostgreSQL >= 13 server — Docker-provided or locally installed.

TEST_DATABASE_URL must name a different database than every known dev
database — DATABASE_URL from the environment, DATABASE_URL from the repo
root .env (moon's serve-e2e task only loads .env.e2e, so the environment
alone can miss it), and Aegra's built-in default — so this script can never
drop a development database.

Uses psycopg, the same driver Aegra itself uses for migrations.
"""

import os
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit

import psycopg
from dotenv import dotenv_values
from psycopg import sql

# Aegra's default database name when DATABASE_URL is unset
# (see aegra_api/settings.py).
AEGRA_DEFAULT_DB = "aegra"

REPO_ROOT = Path(__file__).resolve().parents[3]


def database_name(url: str) -> str:
    return unquote(urlsplit(url).path.lstrip("/"))


def protected_names() -> set[str]:
    names = {AEGRA_DEFAULT_DB}
    for url in (
        os.environ.get("DATABASE_URL"),
        dotenv_values(REPO_ROOT / ".env").get("DATABASE_URL"),
    ):
        if url and database_name(url):
            names.add(database_name(url))
    return names


def reset(test_url: str, test_db: str) -> None:
    # DROP/CREATE DATABASE must run outside the target database; connect to
    # the server's maintenance database instead.
    admin_url = urlunsplit(urlsplit(test_url)._replace(path="/postgres"))
    try:
        conn = psycopg.connect(admin_url, autocommit=True)
    except psycopg.OperationalError as exc:
        sys.exit(
            f"reset_test_db: cannot reach the PostgreSQL server for "
            f"TEST_DATABASE_URL ({exc}). Is it running? Start it with "
            f"`moon backend:docker-postgres` or your own local server."
        )
    with conn:
        ident = sql.Identifier(test_db)
        conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(ident))
        conn.execute(sql.SQL("CREATE DATABASE {}").format(ident))


def main() -> None:
    test_url = os.environ.get("TEST_DATABASE_URL")
    if not test_url:
        sys.exit(
            "reset_test_db: TEST_DATABASE_URL is not set; refusing to guess a database to drop."
        )

    test_db = database_name(test_url)
    if not test_db:
        sys.exit(f"reset_test_db: TEST_DATABASE_URL has no database name: {test_url!r}")

    if test_db in protected_names():
        sys.exit(
            f"reset_test_db: TEST_DATABASE_URL names the database {test_db!r}, "
            f"which matches a dev database (from DATABASE_URL, the root .env, "
            f"or Aegra's default); refusing to drop it. "
            f"Point TEST_DATABASE_URL at a dedicated test database."
        )

    reset(test_url, test_db)
    print(f"reset_test_db: dropped and recreated database {test_db!r}")


if __name__ == "__main__":
    main()
