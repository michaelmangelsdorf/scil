// db-schema.js
// Centralized database schema definitions for all SCIL applications.

export const SCENES_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id INTEGER UNIQUE,
    name TEXT,
    synopsis TEXT,
    canon TEXT,
    sortcode INTEGER,
    after TEXT DEFAULT '1H',
    include BOOLEAN DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`;

export const DIALOGS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS dialogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id INTEGER,
    ai_persona TEXT,
    user_persona TEXT,
    user_query TEXT,
    ai_response TEXT,
    revised TEXT,
    exemplary BOOLEAN DEFAULT 0,
    comment TEXT,
    sortcode INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scene_id) REFERENCES scenes(scene_id) ON DELETE CASCADE
  )
`;

export const AGENTS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT DEFAULT 'Person', 
    desc TEXT DEFAULT 'Roleplay Partner',
    name TEXT,
    canon TEXT,
    goals TEXT, 
    state TEXT, 
    play_prompt TEXT,
    forward_prompt TEXT,
    checker_prompt TEXT,
    awareness_prompt TEXT,
    planner_prompt TEXT,
    style_guide TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`;

// Existing: Schema for vector_embeddings table (for "Teach" button)
export const VECTOR_EMBEDDINGS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS vector_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id INTEGER,
    agent_id INTEGER,
    content TEXT NOT NULL,
    embedding TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scene_id) REFERENCES scenes(scene_id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  )
`;

// Existing: Schema for memory_embeddings table (for "Store" button - persistent knowledge)
export const MEMORY_EMBEDDINGS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS memory_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id INTEGER,
    agent_id INTEGER,
    content TEXT NOT NULL,
    embedding TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scene_id) REFERENCES scenes(scene_id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  )
`;

export const STATE_TABLE_SCHEMA = `
    CREATE TABLE IF NOT EXISTS state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        UNIQUE (domain, key)
    )
`;

// NEW: Schema for app_prompts table
export const APP_PROMPTS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS app_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_name TEXT UNIQUE NOT NULL,
    prompt_text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`;

// NEW: Schema for vocab table
export const VOCAB_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS vocab (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dialog_id INTEGER,
    expr TEXT,
    transl TEXT,
    desc TEXT,
    context TEXT,
    review_date TEXT,
    familiarity REAL,
    FOREIGN KEY (dialog_id) REFERENCES dialogs(id) ON DELETE CASCADE
  )
`;
