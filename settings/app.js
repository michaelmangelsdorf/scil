// settings/app.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

import { resetAppDefaults, dbAll, dbGet, dbRun } from '../utils/db.js'; 
import { updateModelSetting } from '../utils/inferenceService.js'; // NEW IMPORT

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const settingsApp = express();

settingsApp.use(cors());
settingsApp.use(express.json());
settingsApp.use(express.static(path.join(__dirname, 'public')));

settingsApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ... (reset, agent export/import endpoints remain the same) ...
settingsApp.post('/api/reset-defaults', async (req, res) => {
    try {
        await resetAppDefaults();
        res.json({ message: 'App defaults reset successfully.' });
    } catch (error) {
        console.error('Error resetting app defaults:', error);
        res.status(500).json({ error: 'Failed to reset app defaults', details: error.message });
    }
});

settingsApp.get('/api/agents', async (req, res) => {
    try {
        const agents = await dbAll("SELECT id, name, type FROM agents ORDER BY name ASC");
        res.json(agents);
    } catch (err) {
        console.error('Error fetching agents for settings:', err.message);
        res.status(500).json({ error: 'Failed to fetch agents.' });
    }
});

settingsApp.get('/api/export-agent/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const agent = await dbGet("SELECT * FROM agents WHERE id = ?", [id]);
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found.' });
        }
        res.json(agent);
    } catch (err) {
        console.error('Error exporting agent:', err.message);
        res.status(500).json({ error: 'Failed to export agent.', details: err.message });
    }
});

settingsApp.post('/api/import-agent', async (req, res) => {
    const { type, desc, name, canon, goals, state, play_prompt, forward_prompt,
            checker_prompt, awareness_prompt, planner_prompt, style_guide } = req.body;

    if (!name || name.trim() === '' || !type || type.trim() === '') {
        return res.status(400).json({ error: 'Agent name and type are required for import.' });
    }

    try {
        const sql = `
            INSERT INTO agents (
                type, desc, name, canon, goals, state, play_prompt, 
                forward_prompt, checker_prompt, awareness_prompt, planner_prompt, style_guide
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            type, desc || null, name, canon || null, goals || null, state || null,
            play_prompt || null, forward_prompt || null, checker_prompt || null,
            awareness_prompt || null, planner_prompt || null, style_guide || null
        ];

        const result = await dbRun(sql, params);
        res.status(201).json({ message: 'Agent imported successfully.', id: result.lastID });
    } catch (err) {
        console.error('Error importing agent:', err.message);
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'Agent with this name already exists.', details: err.message });
        }
        res.status(500).json({ error: 'Failed to import agent.', details: err.message });
    }
});


// --- Model settings endpoints ---

settingsApp.get('/api/model-settings', async (req, res) => {
    try {
        const row = await dbGet("SELECT value FROM state WHERE domain = 'models' AND key = 'use_lm_studio'");
        if (row) {
            res.json({ value: row.value });
        } else {
            res.status(404).json({ error: 'Setting not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch model settings', details: err.message });
    }
});

settingsApp.post('/api/model-settings', async (req, res) => {
    const { useLmStudio } = req.body;
    if (typeof useLmStudio !== 'string') {
        return res.status(400).json({ error: 'Invalid setting value provided.' });
    }
    try {
        await dbRun(
            "INSERT OR REPLACE INTO state (domain, key, value) VALUES ('models', 'use_lm_studio', ?)",
            [useLmStudio]
        );
        // NEW: Notify the inference service of the change
        updateModelSetting(useLmStudio === 'true');
        res.json({ message: 'Model setting saved successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save model setting', details: err.message });
    }
});

export default settingsApp;