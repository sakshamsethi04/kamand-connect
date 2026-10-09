from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://kamand:kamand@localhost:5432/kamand"
    jwt_secret: str = "dev-only-secret-change-me-dev-only-secret-change-me"
    jwt_expire_hours: int = 24 * 7
    cookie_secure: bool = False
    allowed_email_domains: str = "students.iitmandi.ac.in,iitmandi.ac.in"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000"
    upload_dir: str = "uploads"
    anon_slowmode_seconds: int = 8
    report_hide_threshold: int = 3
    mod_emails: str = ""  # comma separated; these accounts get the moderation panel

    @property
    def email_domains(self) -> list[str]:
        return [d.strip().lower() for d in self.allowed_email_domains.split(",") if d.strip()]

    @property
    def mods(self) -> set[str]:
        return {e.strip().lower() for e in self.mod_emails.split(",") if e.strip()}

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
