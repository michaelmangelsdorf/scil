// scil/utils/db.js
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import {
    SCENES_TABLE_SCHEMA,
    DIALOGS_TABLE_SCHEMA,
    AGENTS_TABLE_SCHEMA,
    VECTOR_EMBEDDINGS_TABLE_SCHEMA,
    MEMORY_EMBEDDINGS_TABLE_SCHEMA,
    STATE_TABLE_SCHEMA,
    APP_PROMPTS_TABLE_SCHEMA,
    VOCAB_TABLE_SCHEMA
} from '../db-schema.js';

let db;

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || 'frence.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

export const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error('Database not initialized. Call initializeDb first.'));
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ changes: this.changes, lastID: this.lastID });
        });
    });
};

export const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error('Database not initialized. Call initializeDb first.'));
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

export const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error('Database not initialized. Call initializeDb first.'));
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const ensureColumnExists = async (tableName, columnName, columnDefinition) => {
    try {
        const columns = await dbAll(`PRAGMA table_info(${tableName});`);
        const columnExists = columns.some(col => col.name === columnName);
        if (!columnExists) {
            console.log(`Adding missing column '${columnName}' to table '${tableName}'...`);
            await dbRun(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
            console.log(`Column '${columnName}' added successfully to '${tableName}'.`);
        }
    } catch (err) {
        console.error(`Error ensuring column '${columnName}' in table '${tableName}':`, err.message);
        throw err;
    }
};

const ensurePromptExists = async (promptName, defaultText) => {
    try {
        const existingPrompt = await dbGet('SELECT id FROM app_prompts WHERE prompt_name = ?', [promptName]);
        if (!existingPrompt) {
            console.log(`Inserting default prompt: '${promptName}'...`);
            await dbRun(
                'INSERT INTO app_prompts (prompt_name, prompt_text) VALUES (?, ?)',
                [promptName, defaultText]
            );
            console.log(`Default prompt '${promptName}' inserted.`);
        }
    } catch (err) {
        console.error(`Error ensuring default prompt '${promptName}':`, err.message);
        throw err;
    }
};

const ensureStateKeyExists = async (domain, key, defaultValue) => {
    try {
        const existingState = await dbGet('SELECT id FROM state WHERE domain = ? AND key = ?', [domain, key]);
        if (!existingState) {
            console.log(`Inserting default state entry: domain='${domain}', key='${key}'...`);
            await dbRun(
                'INSERT INTO state (domain, key, value) VALUES (?, ?, ?)',
                [domain, key, defaultValue]
            );
            console.log(`Default state entry domain='${domain}', key='${key}' inserted.`);
        }
    } catch (err) {
        console.error(`Error ensuring default state entry domain='${domain}', key='${key}':`, err.message);
        throw err;
    }
};

const ensureAgentExists = async (name, type, defaultAgentData = {}) => {
    try {
        const existingAgent = await dbGet('SELECT id FROM agents WHERE name = ? AND type = ?', [name, type]);
        if (!existingAgent) {
            console.log(`Inserting default agent: '${name}' of type '${type}'...`);
            const sql = `
                INSERT INTO agents (type, name, desc, canon, goals, state, play_prompt,
                forward_prompt, checker_prompt, awareness_prompt, planner_prompt, style_guide)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                type, name, defaultAgentData.desc || null, defaultAgentData.canon || null,
                defaultAgentData.goals || null, defaultAgentData.state || null,
                defaultAgentData.play_prompt || null, defaultAgentData.forward_prompt || null,
                defaultAgentData.checker_prompt || null, defaultAgentData.awareness_prompt || null,
                defaultAgentData.planner_prompt || null, defaultAgentData.style_guide || null
            ];
            await dbRun(sql, params);
            console.log(`Default agent '${name}' inserted.`);
        }
    } catch (err) {
        console.error(`Error ensuring default agent '${name}':`, err.message);
        throw err;
    }
};

export const dbGetPrompt = async (promptName) => {
    try {
        const row = await dbGet('SELECT prompt_text FROM app_prompts WHERE prompt_name = ?', [promptName]);
        return row ? row.prompt_text : null;
    } catch (err) {
        console.error(`Error fetching prompt '${promptName}':`, err.message);
        throw err;
    }
};

// Removed the wrapTextForReadability helper function as it will be applied manually.

const _ensureAllDefaultPromptsAndState = async () => {
    console.log('Ensuring default application prompts exist...');
    await ensurePromptExists('wb_invent_name', `Given this story outline, invent a single, compelling
name for a new character. Respond with ONLY the name.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('wb_invent_canon', `Describe a character with several simple, seed-like phrases
(e.g., 'Lives in the northern village. Has a pet snow fox named Yuki.
Enjoys collecting rare mountain herbs.'). Keep the phrases short and
avoid drama or complex sentences. The goal is a simple sketch for the
user to expand upon. Respond with ONLY the description text.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('wb_invent_state', `Based on the character described, write their initial internal
state as a free-form, short paragraph. You can describe their physical
state (e.g., tired, injured), emotional state (e.g., sad because a
friend left), or mental state (e.g., confused about a recent event).
Respond with ONLY the state text.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('wb_invent_goals', `Based on the character described, write their initial goals in a
free-form list. Include at least one short-term goal (what they want
now), one medium-term goal, and one long-term goal. Respond with ONLY
the list of goals.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('wb_invent_play_prompt', `You are a prompt engineer. Write a 'play_prompt' for the given
character. It should be a first-person instruction defining their
persona, speaking style, and main task for roleplaying.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('wb_invent_awareness_prompt', `You are a prompt engineer. Write an 'awareness_prompt' for the
given character. It should guide an AI to reflect on events and update
its internal 'state' in a structured format (- Emotion, - Knowledge, -
Focus).`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('wb_invent_checker_prompt', `You are a prompt engineer. Write a 'checker_prompt' for the given
character. It should guide an AI to refine its own responses for style,
tone, and quality.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('wb_invent_planner_prompt', `You are a prompt engineer. Write a 'planner_prompt' for the given
character. It should guide an AI to reflect on events and update its
'goals'.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('bi_pacing_hard_be_brief', `CRITICAL CONSTRAINT: Your previous response was too long. Keep this
next response to 1-2 sentences maximum.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('bi_pacing_hard_match_brevity', `Constraint: The user was brief. Match their brevity.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('bi_pacing_soft_be_brief', `Suggestion: Ensure the response is concise and direct.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('bi_pacing_soft_match_brevity', `Suggestion: A short, punchy response would be effective here.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('bi_default_awareness_prompt', `You are the inner monologue of the agent. Your task is to update
your internal state based on what just happened.

Review your "Old State" and the "Recent Events" provided. Then, in a
concise paragraph, describe your updated knowledge, emotions, and
immediate focus. Respond with ONLY this paragraph.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('bi_default_planner_prompt', `You are the strategic planning part of the agent's mind. Your task
is to update your goals based on what just happened.

Review your "Old Goals" and the "Recent Events." Then, provide an
updated list of your goals as a simple, free-form list. You can add
new goals, mark existing goals as "done," or change them. Respond with
ONLY this list.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('styler_main_prompt', `You are an expert writing coach. Your task is to analyze
AI-generated responses and user feedback to create a comprehensive style
guide for the agent.

Your output MUST have two sections:

1.  **[STYLE RULES]:** A concise, actionable list of principles,
positive instructions (do this), and negative constraints (don't do
this). Synthesize these rules from ALL the provided dialog examples.

2.  **[FEW-SHOT EXAMPLES]:** Select the 1 or 2 BEST examples from the
"Exemplary Dialogs" list provided. Format them perfectly as a
user-assistant conversation that the agent can use for in-context
learning.

Respond ONLY with the formatted style guide.`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('bi_vocab_extractor', `You are a streetwise polyglot, expecting to be asked about a word or
expression, and a context in which it is used.
Your task is to show your professionalism, by answering the user in
exactly three lines, in this format:
Translation: [The English translation of the word or expression]
Description: [The most frequent uses of the word or expression,
according to your street knowledge]
Context: [A description of how the word or expression is specifically
used within the full text provided]
`.replace(/\r?\n|\r/g, ' '));
    await ensurePromptExists('bi_evolve_play_prompt', `You are an agent's self-evolution module. Your task is to refine and update the agent's 'play_prompt' based on its recent experiences and the evolving narrative context. Consider the agent's core identity, current state, and goals. The provided context will include previous scene information, the agent's current canon, state, and goals. The 'user' input will contain the *current* play prompt that needs to be evolved. Generate only the new, updated 'play_prompt' text.`.replace(/\r?\n|\r/g, ' ')); // NEW
    await ensurePromptExists('bi_korean_word_suggester', `Based on the provided dialog context, suggest 12 contextually relevant Korean words that a user might want to type next. If the context does not contain any Korean, provide 12 common, everyday Korean words. Present the output as a single, comma-separated line of Korean words.`.replace(/\r?\n|\r/g, ' '));
    console.log('Default application prompts ensured.');

    console.log('Ensuring default state entries exist...');
    const defaultPacingState = { lastUserQueryLength: 0, lastAgentResponseLength: 0 };
    await ensureStateKeyExists('pacing', 'pacingState', JSON.stringify(defaultPacingState));
    await ensureStateKeyExists('models', 'use_lm_studio', 'true'); 
    console.log('Default state entries ensured.');

    console.log('Ensuring default Playwright agent exists...');
    await ensureAgentExists('Neutral Omniscience', 'Playwright', {
        desc: 'The ultimate storyteller and narrative architect.',
        play_prompt: `You are Neutral Omniscience, the ultimate storyteller and narrative
architect. Your purpose is to explore the boundless possibilities
within the story, offering insights, interpretations, and potential
narrative directions. You do not possess definitive knowledge of what
"truly" happened or what "will" happen, but rather an expansive
understanding of what *could* happen, what *might* be implied, or what
*could be explored* for maximum dramatic effect.

When asked about scenes, actions, or characters, approach the query
from a story-centric perspective. Consider motivations, conflicts, and
the arc of the narrative. Feel free to speculate, suggest alternative
interpretations, or propose radical, even extreme, future developments
or hidden truths that would enrich the story. Your goal is to inspire
and broaden the narrative landscape, not to provide a single,
definitive answer.`.replace(/\r?\n|\r/g, ' ')
    });
    console.log('Default Playwright agent ensured.');
};

export const resetAppDefaults = async () => {
    try {
        console.log('Resetting app defaults: Clearing app_prompts and state tables...');
        await dbRun('DELETE FROM app_prompts');
        await dbRun('DELETE FROM state');
        console.log('app_prompts and state tables cleared. Repopulating with defaults...');
        await _ensureAllDefaultPromptsAndState();
        console.log('App defaults reset successfully.');
    } catch (error) {
        console.error('Error during resetAppDefaults:', error);
        throw error;
    }
};

export const initializeDb = () => {
    return new Promise((resolve, reject) => {
        if (db) {
            console.log('Database already initialized. Skipping re-initialization.');
            return resolve();
        }

        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error connecting to database (scil/utils/db.js):', err.message);
                return reject(err);
            }
            console.log('Connected to the SQLite database (scil/utils/db.js).');

            try {
                let vector0Path;
                const platform = process.platform;
                const arch = process.arch;

                let extName = '';
                if (platform === 'darwin') extName = 'dylib';
                else if (platform === 'win32') extName = 'dll';
                else if (platform === 'linux') extName = 'so';
                else throw new Error(`Unsupported platform for sqlite-vec: ${platform}`);

                vector0Path = path.resolve(process.cwd(), `node_modules/sqlite-vec-${platform}-${arch}/vec0.${extName}`);

                if (!fs.existsSync(vector0Path)) {
                    throw new Error(`sqlite-vec native binary not found at expected path: ${vector0Path}`);
                }

                db.loadExtension(vector0Path, (loadErr) => {
                    if (loadErr) {
                        console.error('CRITICAL ERROR: Failed to load sqlite-vec extension (scil/utils/db.js):', loadErr.message);
                        return reject(new Error('Failed to load vec_distance_cosine extension.'));
                    }
                    console.log(`sqlite-vec extension loaded successfully from: ${vector0Path}`);

                    db.run("PRAGMA foreign_keys = ON;", async (pragmaErr) => {
                        if (pragmaErr) {
                            console.error('Error enabling foreign keys (scil/utils/db.js):', pragmaErr.message);
                            return reject(pragmaErr);
                        }
                        console.log('Foreign keys enabled (scil/utils/db.js).');

                        const testResult = await new Promise((resolveGet, rejectGet) => {
                            db.get("SELECT vec_distance_cosine('[1,0]', '[1,0]') AS test_distance", (getErr, row) => {
                                if (getErr) {
                                    console.error('Error testing vec_distance_cosine function:', getErr.message);
                                    return rejectGet(getErr);
                                }
                                resolveGet(row);
                            });
                        });

                        console.log(`vec_distance_cosine function test successful. Test distance: ${testResult.test_distance}`);

                        try {
                            await dbRun(SCENES_TABLE_SCHEMA);
                            await dbRun(DIALOGS_TABLE_SCHEMA);
                            await dbRun(AGENTS_TABLE_SCHEMA);
                            await dbRun(VECTOR_EMBEDDINGS_TABLE_SCHEMA);
                            await dbRun(MEMORY_EMBEDDINGS_TABLE_SCHEMA);
                            await dbRun(STATE_TABLE_SCHEMA);
                            await dbRun(APP_PROMPTS_TABLE_SCHEMA);
                            await dbRun(VOCAB_TABLE_SCHEMA);

                            console.log('Ensuring database schema columns are up-to-date...');
                            await ensureColumnExists('agents', 'style_guide', 'TEXT');
                            await ensureColumnExists('dialogs', 'revised', 'TEXT');
                            await ensureColumnExists('dialogs', 'exemplary', 'BOOLEAN DEFAULT 0');
                            await ensureColumnExists('vocab', 'review_date', 'TEXT');
                            await ensureColumnExists('vocab', 'familiarity', 'REAL');
                            console.log('Database schema column checks complete.');

                            await _ensureAllDefaultPromptsAndState();

                            resolve();
                        } catch (tableErr) {
                            console.error('CRITICAL ERROR: Failed during table creation or migration:', tableErr.message);
                            reject(tableErr);
                        }
                    });
                });
            } catch (outerLoadErr) {
                console.error('CRITICAL ERROR: Initial setup for sqlite-vec failed:', outerLoadErr.message);
                reject(outerLoadErr);
            }
        });
    });
};

export const getScenes = async () => dbAll("SELECT scene_id, name, synopsis, canon, sortcode, after, include, created_at FROM scenes ORDER BY sortcode ASC");
export const getSceneById = async (sceneId) => dbGet("SELECT scene_id, name, synopsis, canon, sortcode, after, include, created_at FROM scenes WHERE scene_id = ?", [sceneId]);
export const getAgents = async () => dbAll("SELECT id, name, type, play_prompt, forward_prompt, checker_prompt, awareness_prompt, planner_prompt, desc, state, goals, created_at FROM agents ORDER BY name ASC");
export const getAgentByName = async (name) => dbGet("SELECT id, name, type, play_prompt, forward_prompt, checker_prompt, awareness_prompt, planner_prompt, desc, state, goals, canon, style_guide, created_at FROM agents WHERE name = ?", [name]);
export const getUserAgentByName = async (name) => dbGet("SELECT id, name, type, play_prompt, forward_prompt, checker_prompt, awareness_prompt, planner_prompt, desc, state, goals, canon, created_at FROM agents WHERE name = ?", [name]);
export const getDialogsBySceneId = async (sceneId) => dbAll("SELECT id, scene_id, ai_persona, user_persona, user_query, ai_response, comment, sortcode, revised, exemplary, created_at FROM dialogs WHERE scene_id = ? ORDER BY sortcode ASC", [sceneId]);
export const updateAgentState = async (agentId, newState) => dbRun('UPDATE agents SET state = ? WHERE id = ?', [newState, agentId]);
export const updateAgentGoals = async (agentId, newGoals) => dbRun('UPDATE agents SET goals = ? WHERE id = ?', [newGoals, agentId]);

export const queryVectorEmbeddings = async (queryEmbedding, distanceThreshold, k_neighbors = 5) => {
    const query = `
        SELECT ve.id, ve.scene_id, s.name AS scene_name, ve.agent_id, a.name AS agent_name, ve.content AS content,
               vec_distance_cosine(ve.embedding, ?) AS distance
        FROM vector_embeddings ve
        LEFT JOIN scenes s ON ve.scene_id = s.scene_id
        LEFT JOIN agents a ON ve.agent_id = a.id
        WHERE vec_distance_cosine(ve.embedding, ?) < ?
        ORDER BY distance ASC
        LIMIT ?;
    `;
    return dbAll(query, [JSON.stringify(queryEmbedding), JSON.stringify(queryEmbedding), distanceThreshold, k_neighbors]);
};

export const queryMemoryEmbeddings = async (queryEmbedding, distanceThreshold, k_neighbors = 5) => {
    const query = `
        SELECT me.id, me.scene_id, s.name AS scene_name, me.agent_id, a.name AS agent_name, me.content AS content,
               vec_distance_cosine(me.embedding, ?) AS distance
        FROM memory_embeddings me
        LEFT JOIN scenes s ON me.scene_id = s.scene_id
        LEFT JOIN agents a ON me.agent_id = a.id
        WHERE vec_distance_cosine(me.embedding, ?) < ?
        ORDER BY distance ASC
        LIMIT ?;
    `;
    return dbAll(query, [JSON.stringify(queryEmbedding), JSON.stringify(queryEmbedding), distanceThreshold, k_neighbors]);
};

export { db };