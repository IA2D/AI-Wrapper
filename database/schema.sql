CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX auth_sessions_user_id_idx (user_id),
  CONSTRAINT auth_sessions_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  messages_json JSON NOT NULL,
  metadata_json JSON NULL,
  attached_pdfs_json JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX chat_sessions_user_updated_idx (user_id, updated_at),
  CONSTRAINT chat_sessions_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id VARCHAR(64) PRIMARY KEY,
  thinking_mode BOOLEAN NOT NULL DEFAULT FALSE,
  current_session_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT user_preferences_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_jobs (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  prompt MEDIUMTEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  page_count INT NOT NULL,
  page_range_json JSON NULL,
  document_kind VARCHAR(32) NOT NULL,
  export_format VARCHAR(32) NOT NULL,
  template_id VARCHAR(32) NOT NULL DEFAULT 'executive',
  include_tables BOOLEAN NOT NULL DEFAULT TRUE,
  include_charts BOOLEAN NOT NULL DEFAULT FALSE,
  outline_json JSON NULL,
  content_json JSON NULL,
  progress_json JSON NOT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX document_jobs_user_updated_idx (user_id, updated_at),
  CONSTRAINT document_jobs_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flow_chart_jobs (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  prompt MEDIUMTEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  content_json JSON NULL,
  progress_json JSON NOT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX flow_chart_jobs_user_updated_idx (user_id, updated_at),
  CONSTRAINT flow_chart_jobs_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_prefix VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  allow_text BOOLEAN NOT NULL DEFAULT TRUE,
  allow_image BOOLEAN NOT NULL DEFAULT FALSE,
  allow_video BOOLEAN NOT NULL DEFAULT FALSE,
  allow_voice BOOLEAN NOT NULL DEFAULT FALSE,
  limit_period VARCHAR(32) NOT NULL DEFAULT 'month',
  request_limit INT NULL,
  token_limit INT NULL,
  unlimited_until DATETIME NULL,
  created_by VARCHAR(64) NULL,
  assigned_user_id VARCHAR(64) NULL,
  token_cipher TEXT NULL,
  last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX api_keys_status_idx (status),
  INDEX api_keys_created_by_idx (created_by),
  INDEX api_keys_assigned_user_idx (assigned_user_id),
  CONSTRAINT api_keys_created_by_fk
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT api_keys_assigned_user_fk
    FOREIGN KEY (assigned_user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_model_configs (
  id VARCHAR(64) PRIMARY KEY,
  label VARCHAR(160) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  model VARCHAR(160) NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  api_key_cipher TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  supports_text BOOLEAN NOT NULL DEFAULT TRUE,
  supports_image BOOLEAN NOT NULL DEFAULT FALSE,
  supports_voice BOOLEAN NOT NULL DEFAULT FALSE,
  supports_json BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ai_model_configs_status_idx (status),
  INDEX ai_model_configs_model_idx (model),
  INDEX ai_model_configs_default_idx (is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_model_user_limits (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  model_config_id VARCHAR(64) NOT NULL,
  limit_period VARCHAR(32) NOT NULL DEFAULT 'month',
  request_limit INT NULL,
  token_limit INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ai_model_user_limits_unique (user_id, model_config_id),
  INDEX ai_model_user_limits_user_idx (user_id),
  INDEX ai_model_user_limits_model_idx (model_config_id),
  CONSTRAINT ai_model_user_limits_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT ai_model_user_limits_model_fk
    FOREIGN KEY (model_config_id) REFERENCES ai_model_configs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_events (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NULL,
  api_key_id VARCHAR(64) NULL,
  model_config_id VARCHAR(64) NULL,
  source VARCHAR(32) NOT NULL,
  capability VARCHAR(32) NOT NULL DEFAULT 'text',
  request_count INT NOT NULL DEFAULT 1,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  model VARCHAR(120) NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX usage_events_user_created_idx (user_id, created_at),
  INDEX usage_events_api_key_created_idx (api_key_id, created_at),
  INDEX usage_events_source_created_idx (source, created_at),
  CONSTRAINT usage_events_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT usage_events_api_key_id_fk
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
