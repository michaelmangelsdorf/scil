import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

// Use our shared, centralized utility
import { dbAll, dbRun, dbGet, dbGetPrompt } from '../utils/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const agentEditorApp = express();

// Middleware
agentEditorApp.use(cors());
agentEditorApp.use(express.json());
agentEditorApp.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for the sub-app's root
agentEditorApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API Endpoints (refactored with async/await) ---

agentEditorApp.get('/api/agents', async (req, res) => {
    const { type } = req.query;
    let query = 'SELECT * FROM agents';
    let params = [];
    if (type) {
        query += ' WHERE type = ?';
        params.push(type);
    }
    try {
        const rows = await dbAll(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

agentEditorApp.post('/api/agents', async (req, res) => {
    const { type, desc, name, play_prompt, canon, forward_prompt, checker_prompt, awareness_prompt, planner_prompt, goals, state } = req.body;
    if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Agent name is required.' });
    }
    try {
        const sql = 'INSERT INTO agents (type, desc, name, play_prompt, canon, forward_prompt, checker_prompt, awareness_prompt, planner_prompt, goals, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const params = [type || 'Person', desc || 'Roleplay Partner', name, play_prompt || '', canon || '', forward_prompt || '', checker_prompt || '', awareness_prompt || '', planner_prompt || '', goals || '', state || ''];
        const result = await dbRun(sql, params);
        res.status(201).json({ id: result.lastID, ...req.body });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

agentEditorApp.put('/api/agents/:id', async (req, res) => {
    const { id } = req.params;
    const { type, desc, name, play_prompt, canon, forward_prompt, checker_prompt, awareness_prompt, planner_prompt, goals, state } = req.body;
    if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Agent name is required.' });
    }
    try {
        const sql = 'UPDATE agents SET type = ?, desc = ?, name = ?, play_prompt = ?, canon = ?, forward_prompt = ?, checker_prompt = ?, awareness_prompt = ?, planner_prompt = ?, goals = ?, state = ? WHERE id = ?';
        const params = [type || '', desc || '', name, play_prompt || '', canon || '', forward_prompt || '', checker_prompt || '', awareness_prompt || '', planner_prompt || '', goals || '', state || '', id];
        const result = await dbRun(sql, params);
        if (result.changes === 0) return res.status(404).json({ error: 'Agent not found.' });
        res.json({ message: 'Agent updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

agentEditorApp.delete('/api/agents/:id', async (req, res) => {
    try {
        const result = await dbRun('DELETE FROM agents WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Agent not found.' });
        res.json({ message: 'Agent deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// MODIFIED: This route now fetches from app_prompts if domain is 'agent-prompts'
agentEditorApp.get('/api/state/:domain/:key', async (req, res) => {
    try {
        const { domain, key } = req.params;
        let valueToReturn = null;

        if (domain === 'agent-prompts') {
            // Fetch directly from app_prompts table for known agent-related prompts
            // Use the prompt names defined in utils/db.js ensurePromptExists
            if (key === 'default_awareness_prompt') {
                valueToReturn = await dbGetPrompt('bi_default_awareness_prompt');
            } else if (key === 'default_planner_prompt') {
                valueToReturn = await dbGetPrompt('bi_default_planner_prompt');
            }
        } else {
            // For other domains, continue fetching from the 'state' table as before
            const row = await dbGet('SELECT value FROM state WHERE domain = ? AND key = ?', [domain, key]);
            if (row) {
                valueToReturn = row.value;
            }
        }

        if (valueToReturn !== null) { // Check for explicit null, as value can be empty string
            res.json({ value: valueToReturn });
        } else {
            res.status(404).json({ error: 'State or prompt not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch state or prompt', details: err.message });
    }
});


agentEditorApp.post('/api/clear-agents-table', async (req, res) => {
    try {
        await dbRun('DELETE FROM agents');
        res.json({ message: "All agents have been cleared." });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear agents table.' });
    }
});


// REMOVED: The custom startup logic for default prompts is now handled by initializeDb in utils/db.js
/*
(async () => {
    console.log('[agent-edit] Checking for default agent prompts in database...');

    const defaultAwarenessPrompt = `You are the inner monologue of the agent. Your task is to update your internal state based on what just happened.\n\nReview your "Old State" and the "Recent Events" provided. Then, rewrite the "New State" to reflect your updated knowledge, emotions, and immediate focus.\n\n**YOUR OUTPUT MUST STRICTLY FOLLOW THIS FORMAT:**\n- Emotion: [A single word describing your primary emotion, e.g., Curious, Wary, Confident]\n- Knowledge: [A brief, one-sentence summary of new information you have learned]\n- Focus: [A short phrase describing what you are currently thinking about or want to address]\n\n**EXAMPLE:**\n---\nOld State:\n- Emotion: Neutral\n- Knowledge: I am waiting for the user to act.\n- Focus: The locked door in front of us.\n\nRecent Events:\nThe user just picked the lock on the door, revealing a dark, dusty corridor. A strange noise echoed from the far end.\n\nNew State:\n- Emotion: Wary\n- Knowledge: The user has opened the door, and there is an unknown sound ahead.\n- Focus: The source of the noise down the corridor.\n---\n\nNow, perform this task with the following inputs.`;
    const defaultPlannerPrompt = `You are the strategic planning part of the agent's mind. Your task is to update your goals based on what just happened.\n\nReview your "Old Goals" and the "Recent Events." Then, rewrite the "New Goals" list. Your goals should be clear, actionable imperatives that will drive your next actions. You can add new goals, mark existing goals as "done," or change them.\n\n**YOUR OUTPUT MUST BE A VALID JSON ARRAY OF GOAL OBJECTS. Do not add any other text before or after the JSON array.**\n\n**EXAMPLE:**\n---\nOld Goals:\n[\n    {"goal": "Find a way to open the locked gate", "status": "active"},\
    {"goal": "Find out who the mysterious stranger is", "status": "active"}\
]\n\nRecent Events:\nThe user found a key under a floorboard and used it to unlock the main gate. The mysterious stranger was seen running away from the gate.\n\nNew Goals:\n[\n    {"goal": "Find a way to open the locked gate", "status": "done"},\
    {"goal": "Find out who the mysterious stranger is", "status": "active"},\
    {"goal": "Pursue the mysterious stranger through the gate", "status": "new", "imperative": "In my next turn, I must convince the user to follow the stranger with me."}\
]\n---\n\nNow, perform this task with the following inputs.`;
    
    try {
        // Use a helper to check and create if missing
        const checkAndCreate = async (key, defaultText) => {
            const row = await dbGet('SELECT value FROM state WHERE domain = ? AND key = ?', ['agent-prompts', key]);
            if (!row) {
                await dbRun('INSERT INTO state (domain, key, value) VALUES (?, ?, ?)', ['agent-prompts', key, defaultText]);
                console.log(`[agent-edit] Default prompt '${key}' created in state table.`);
            }
        };

        await checkAndCreate('default_awareness_prompt', defaultAwarenessPrompt);
        await checkAndCreate('default_planner_prompt', defaultPlannerPrompt);
        console.log('[agent-edit] Default agent prompts checked and are available.');
    } catch (error) {
        console.error('[agent-edit] CRITICAL: Failed to ensure default prompts exist.', error);
    }
})();
*/

export default agentEditorApp;