"""Central configuration. All secrets come from environment variables (never the Android app)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Business AI Manager API"
    environment: str = "development"  # development | staging | production
    database_url: str = "sqlite:///./sme_ai_manager.db"  # postgresql+psycopg://... in production

    jwt_secret: str = "change-me-in-production-please-32+chars"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24 * 7

    # LLM gateway
    llm_provider: str = "mock"  # mock | anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"
    llm_max_output_tokens: int = 1024
    llm_timeout_seconds: float = 45.0

    # Commercial model
    trial_days: int = 30
    subscription_price_gbp: str = "4.99"
    play_package_name: str = "com.softwareequality.smeaimanager"
    play_subscription_id: str = "sme_ai_manager_monthly"
    google_service_account_json: str = ""  # path to Play Developer API service-account key

    # Usage quotas (per business per calendar month) - tune from backend without app updates
    quota_trial_llm_requests: int = 300
    quota_paid_llm_requests: int = 1500
    quota_tokens_per_month: int = 1_500_000
    quota_file_mb_per_month: int = 500
    max_upload_mb: int = 15
    rate_limit_per_minute: int = 30

    # AdMob - public identifier only (no secrets)
    admob_publisher_id: str = "pub-2980680946304710"

    storage_dir: str = "./storage"


@lru_cache
def get_settings() -> Settings:
    return Settings()
