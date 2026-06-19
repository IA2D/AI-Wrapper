import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import { randomBytes, randomUUID, pbkdf2Sync } from 'crypto';

const globalForDb = globalThis as typeof globalThis & {
  __mysqlPool?: Pool;
  __schemaReady?: Promise<void>;
};

export function getPool() {
  if (!globalForDb.__mysqlPool) {
    const uri = process.env.DATABASE_URL;

    globalForDb.__mysqlPool = uri
      ? mysql.createPool(uri)
      : mysql.createPool({
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT || 3306),
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'chatbot69',
          waitForConnections: true,
          connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
        });
  }

  return globalForDb.__mysqlPool;
}

export async function ensureDatabaseSchema() {
  if (!globalForDb.__schemaReady) {
    globalForDb.__schemaReady = initializeSchema();
  }

  return globalForDb.__schemaReady;
}

async function initializeSchema() {
  const pool = getPool();

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'user',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnIfMissing('users', 'role', "VARCHAR(32) NOT NULL DEFAULT 'user'");

  await pool.execute(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id VARCHAR(64) PRIMARY KEY,
      thinking_mode BOOLEAN NOT NULL DEFAULT FALSE,
      current_session_id VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT user_preferences_user_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS chat_runs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      session_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      status_message VARCHAR(120) NULL,
      thinking_mode BOOLEAN NOT NULL DEFAULT FALSE,
      request_messages_json JSON NOT NULL,
      answer_text MEDIUMTEXT NOT NULL,
      thinking_text MEDIUMTEXT NOT NULL,
      assistant_message_json JSON NULL,
      error_message TEXT NULL,
      stop_reason VARCHAR(32) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX chat_runs_user_session_updated_idx (user_id, session_id, updated_at),
      INDEX chat_runs_status_idx (status),
      CONSTRAINT chat_runs_user_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnIfMissing('chat_runs', 'status_message', 'VARCHAR(120) NULL');

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_memories (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      kind VARCHAR(32) NOT NULL,
      content VARCHAR(500) NOT NULL,
      importance TINYINT NOT NULL DEFAULT 3,
      source_message_id VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX user_memories_user_updated_idx (user_id, updated_at),
      INDEX user_memories_user_importance_idx (user_id, importance, updated_at),
      CONSTRAINT user_memories_user_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
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
      enable_search BOOLEAN NOT NULL DEFAULT FALSE,
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnIfMissing('document_jobs', 'template_id', "VARCHAR(32) NOT NULL DEFAULT 'executive'");
  await addColumnIfMissing('document_jobs', 'page_range_json', 'JSON NULL');
  await addColumnIfMissing('document_jobs', 'enable_search', 'BOOLEAN NOT NULL DEFAULT FALSE');

  await pool.execute(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnIfMissing('api_keys', 'assigned_user_id', 'VARCHAR(64) NULL');
  await addColumnIfMissing('api_keys', 'token_cipher', 'TEXT NULL');

  await pool.execute(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NULL,
      api_key_id VARCHAR(64) NULL,
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnIfMissing('usage_events', 'model_config_id', 'VARCHAR(64) NULL');

  await seedAdminAccount();
}

async function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  const pool = getPool();
  const [rows] = await pool.execute<Array<RowDataPacket & { count: number }>>(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  if (!rows[0]?.count) {
    await pool.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function hashSeedPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

async function seedAdminAccount() {
  const pool = getPool();
  const hasConfiguredAdminEmail = Boolean(process.env.ADMIN_EMAIL);
  const hasConfiguredAdminPassword = Boolean(process.env.ADMIN_PASSWORD);
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@chatbot69.local').trim().toLowerCase();
  const adminName = (process.env.ADMIN_NAME || 'Admin').trim() || 'Admin';

  const [existingAdmins] = await pool.execute<Array<RowDataPacket & { count: number }>>(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'"
  );

  const [existingEmail] = await pool.execute<Array<RowDataPacket & { id: string }>>(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [adminEmail]
  );

  if (existingEmail[0]?.id) {
    if (hasConfiguredAdminPassword) {
      const { hash, salt } = hashSeedPassword(process.env.ADMIN_PASSWORD || '');
      await pool.execute(
        "UPDATE users SET name = ?, role = 'admin', password_hash = ?, password_salt = ? WHERE id = ?",
        [adminName, hash, salt, existingEmail[0].id]
      );
      console.log(`[Admin bootstrap] Synced configured admin account: ${adminEmail}`);
      console.log(`[Admin bootstrap] Password comes from ADMIN_PASSWORD in .env`);
    } else {
      await pool.execute("UPDATE users SET name = ?, role = 'admin' WHERE id = ?", [adminName, existingEmail[0].id]);
      console.log(`[Admin bootstrap] Promoted existing account to admin: ${adminEmail}`);
    }

    await pool.execute('INSERT IGNORE INTO user_preferences (user_id) VALUES (?)', [existingEmail[0].id]);
    return;
  }

  if (existingAdmins[0]?.count && !hasConfiguredAdminEmail) {
    return;
  }

  const generatedPassword = !process.env.ADMIN_PASSWORD;
  const adminPassword = process.env.ADMIN_PASSWORD || randomBytes(12).toString('base64url');
  const { hash, salt } = hashSeedPassword(adminPassword);
  const adminId = randomUUID();

  await pool.execute(
    'INSERT INTO users (id, name, email, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?, ?)',
    [adminId, adminName, adminEmail, hash, salt, 'admin']
  );
  await pool.execute('INSERT INTO user_preferences (user_id) VALUES (?)', [adminId]);

  console.log('[Admin bootstrap] Created admin account because none existed.');
  console.log(`[Admin bootstrap] Email: ${adminEmail}`);
  console.log(`[Admin bootstrap] Password: ${adminPassword}`);
  if (generatedPassword) {
    console.log('[Admin bootstrap] Set ADMIN_EMAIL and ADMIN_PASSWORD in .env to control these credentials.');
  }
}
