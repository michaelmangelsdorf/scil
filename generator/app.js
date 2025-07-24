// generator/app.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbAll, dbGet, dbRun, dbGetPrompt } from '../utils/db.js';
import { inferChat, streamInferChat, fetchModels, isUsingLmStudio, getLocalModelInitStatus } from '../utils/inferenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generatorApp = express.Router();

generatorApp.use(express.json());
generatorApp.use(express.static(path.join(__dirname, 'public')));

// --- API Endpoints ---

generatorApp.get('/api/models', async (req, res) => {
    try {
        const lmStudioActive = await isUsingLmStudio();
        if (!lmStudioActive) {
            const localStatus = getLocalModelInitStatus();
            if (localStatus === 'failed') {
                return res.status(503).json({
                    error: 'Local models failed to load. Please check your .env file and server logs.',
                    localModelError: true
                });
            }
        }

        const modelsData = await fetchModels();
        res.json({
            availableModels: modelsData.data,
            preferredModel: modelsData.preferredInferenceModelId,
            isLmStudio: lmStudioActive
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch models.' });
    }
});

generatorApp.get('/api/state/:domain/:key', async (req, res) => {
    try {
        const { domain, key } = req.params;
        const row = await dbGet('SELECT value FROM state WHERE domain = ? AND key = ?', [domain, key]);
        if (row) {
            res.json({ domain, key, value: row.value });
        } else {
            res.status(404).json({ error: 'State not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch state' });
    }
});

generatorApp.post('/api/state', async (req, res) => {
    try {
        const { domain, key, value } = req.body;
        if (!domain || !key || value === undefined) {
            return res.status(400).json({ error: 'Domain, key, and value are required.' });
        }
        await dbRun('INSERT OR REPLACE INTO state (domain, key, value) VALUES (?, ?, ?)', [domain, key, value]);
        res.status(200).json({ message: 'State saved successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save state' });
    }
});

generatorApp.get('/api/agents', async (req, res) => {
    try {
        const agents = await dbAll("SELECT id, name, desc, canon FROM agents WHERE type = 'Person' ORDER BY name ASC");
        res.json(agents);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch agents' }); }
});

generatorApp.delete('/api/agents/:id', async (req, res) => {
    try {
        const result = await dbRun('DELETE FROM agents WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Agent not found.' });
        res.json({ message: 'Agent deleted successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

generatorApp.post('/api/invent/name', async (req, res) => {
    const { storyOutline, modelId } = req.body;
    try {
        const systemPrompt = await dbGetPrompt('wb_invent_name');
        if (!systemPrompt) throw new Error('Prompt "wb_invent_name" not found in database.');

        const name = await inferChat([{ role: 'system', content: systemPrompt }, { role: 'user', content: storyOutline }], modelId, 20);
        res.json({ name: name.trim().replace(/"/g, '') });
    } catch (error) { res.status(500).json({ error: 'Failed to invent name', details: error.message }); }
});

generatorApp.post('/api/invent/canon', async (req, res) => {
    const { storyOutline, characterName, modelId } = req.body;
    try {
        const systemPrompt = await dbGetPrompt('wb_invent_canon');
        if (!systemPrompt) throw new Error('Prompt "wb_invent_canon" not found in database.');

        const userPrompt = `Story Outline:\n${storyOutline}\n\nCharacter Name: ${characterName}\n\nDescribe this character:`;

        await streamInferChat([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], modelId, res, 400);
    } catch (error) { if (!res.headersSent) res.status(500).json({ error: 'Failed to stream canon' }); }
});

generatorApp.post('/api/invent/state', async (req, res) => {
    const { characterName, characterCanon, modelId } = req.body;
    try {
        const systemPrompt = await dbGetPrompt('wb_invent_state');
        if (!systemPrompt) throw new Error('Prompt "wb_invent_state" not found in database.');

        const userPrompt = `Name: ${characterName}\nCanon: ${characterCanon}`;
        await streamInferChat([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], modelId, res, 200);
    } catch (error) { if (!res.headersSent) res.status(500).json({ error: 'Failed to stream state' }); }
});

generatorApp.post('/api/invent/goals', async (req, res) => {
    const { characterName, characterCanon, modelId } = req.body;
    try {
        const systemPrompt = await dbGetPrompt('wb_invent_goals');
        if (!systemPrompt) throw new Error('Prompt "wb_invent_goals" not found in database.');

        const userPrompt = `Name: ${characterName}\nCanon: ${characterCanon}`;
        await streamInferChat([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], modelId, res, 300);
    } catch (error) { if (!res.headersSent) res.status(500).json({ error: 'Failed to stream goals' }); }
});

const generatePrompt = async (req, res, promptNameKey, character) => {
    try {
        const { modelId } = req.body;
        const systemPrompt = await dbGetPrompt(promptNameKey);
        if (!systemPrompt) throw new Error(`Prompt "${promptNameKey}" not found in database.`);
        
        const userPrompt = `Character Identity:\n${JSON.stringify(character, null, 2)}`;
        const generatedPrompt = await inferChat([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], modelId, 500);
        res.json({ prompt: generatedPrompt });
    } catch (error) { res.status(500).json({ error: `Failed to generate ${promptNameKey}`, details: error.message }); }
};

generatorApp.post('/api/invent/play_prompt', (req, res) => {
    generatePrompt(req, res, 'wb_invent_play_prompt', req.body.character);
});
generatorApp.post('/api/invent/awareness_prompt', (req, res) => {
    generatePrompt(req, res, 'wb_invent_awareness_prompt', req.body.character);
});
generatorApp.post('/api/invent/checker_prompt', (req, res) => {
    generatePrompt(req, res, 'wb_invent_checker_prompt', req.body.character);
});
generatorApp.post('/api/invent/planner_prompt', (req, res) => {
    generatePrompt(req, res, 'wb_invent_planner_prompt', req.body.character);
});

generatorApp.post('/api/agents/create-full', async (req, res) => {
    try {
        const { name, desc, canon, play_prompt, awareness_prompt, checker_prompt, planner_prompt, goals, state } = req.body;
        const sql = 'INSERT INTO agents (type, name, desc, canon, play_prompt, awareness_prompt, checker_prompt, planner_prompt, goals, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const params = [ 'Person', name, desc, canon, play_prompt, awareness_prompt, checker_prompt, planner_prompt, goals, state ];
        const result = await dbRun(sql, params);
        res.status(201).json({ id: result.lastID, ...req.body });
    } catch (error) { res.status(500).json({ error: 'Failed to save final agent', details: error.message }); }
});

export default generatorApp;
