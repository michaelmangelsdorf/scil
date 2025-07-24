import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { dbRun, dbGet, dbAll } from '../utils/db.js';
import { inferChat } from '../utils/inferenceService.js'; // UPDATED
import { countTokens } from '../utils/tokenizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sceneEditorApp = express();

// Middleware
sceneEditorApp.use(express.json());
sceneEditorApp.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for the sub-app's root
sceneEditorApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. All local database connection logic has been REMOVED.
// The app now correctly assumes the central server has already initialized the DB.

// --- API Endpoints ---

sceneEditorApp.get('/api/scenes', async (req, res) => {
    try {
        const scenes = await dbAll("SELECT * FROM scenes ORDER BY sortcode ASC");
        for (const scene of scenes) {
            const dialogs = await dbAll('SELECT user_query, ai_response FROM dialogs WHERE scene_id = ?', [scene.scene_id]);
            let dialogTokens = 0;
            dialogs.forEach(dialog => {
                dialogTokens += countTokens(dialog.user_query) + countTokens(dialog.ai_response);
            });
            scene.estimated_dialog_tokens = dialogTokens;
            scene.estimated_scene_tokens = countTokens(scene.canon) + countTokens(scene.synopsis);
        }
        res.json(scenes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

sceneEditorApp.get('/api/scenes/:scene_id', async (req, res) => {
    try {
        const scene = await dbGet("SELECT * FROM scenes WHERE scene_id = ?", [req.params.scene_id]);
        if (!scene) return res.status(404).json({ message: 'Scene not found' });
        
        const dialogs = await dbAll('SELECT user_query, ai_response FROM dialogs WHERE scene_id = ?', [scene.scene_id]);
        let dialogTokens = 0;
        dialogs.forEach(dialog => {
            dialogTokens += countTokens(dialog.user_query) + countTokens(dialog.ai_response);
        });
        scene.estimated_dialog_tokens = dialogTokens;
        scene.estimated_scene_tokens = countTokens(scene.canon) + countTokens(scene.synopsis);
        res.json(scene);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

sceneEditorApp.post('/api/scenes', async (req, res) => {
    const { scene_id, name, synopsis, canon, after, include } = req.body;
    try {
        if (scene_id) {
            const result = await dbRun(
                "UPDATE scenes SET name = ?, synopsis = ?, canon = ?, after = ?, include = ? WHERE scene_id = ?",
                [name, synopsis, canon, after, include, scene_id]
            );
            res.json({ message: 'Scene updated successfully', changes: result.changes });
        } else {
            // Get the next available scene_id
            const lastScene = await dbGet("SELECT MAX(scene_id) as max_id FROM scenes");
            const newSceneId = (lastScene?.max_id || 0) + 1;
            const result = await dbRun(
                "INSERT INTO scenes (scene_id, name, synopsis, canon, sortcode, after, include) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [newSceneId, name, synopsis, canon, newSceneId, after, include === undefined ? 1 : include]
            );
            res.status(201).json({ id: result.lastID, scene_id: newSceneId, message: 'Scene created successfully' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

sceneEditorApp.delete('/api/scenes/:scene_id', async (req, res) => {
    try {
        const result = await dbRun("DELETE FROM scenes WHERE scene_id = ?", [req.params.scene_id]);
        if (result.changes === 0) return res.status(404).json({ message: 'Scene not found' });
        res.json({ message: 'Scene and associated dialogs deleted successfully', changes: result.changes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

sceneEditorApp.put('/api/scenes/reorder', async (req, res) => {
    const { sceneOrder } = req.body;
    if (!Array.isArray(sceneOrder)) return res.status(400).json({ error: 'Invalid scene order data.' });
    
    // Using a transaction is good practice here, but dbRun handles one statement at a time.
    // For simplicity, we run them sequentially. For true transactions, db.js could be extended.
    try {
        for (const item of sceneOrder) {
            await dbRun("UPDATE scenes SET sortcode = ? WHERE scene_id = ?", [item.sortcode, item.scene_id]);
        }
        res.json({ message: 'Scene order updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reorder scenes: ' + err.message });
    }
});

sceneEditorApp.put('/api/scenes/:scene_id/include', async (req, res) => {
    const { scene_id } = req.params;
    const { include } = req.body;
    if (typeof include === 'undefined') return res.status(400).json({ error: 'Invalid "include" value.' });
    try {
        const result = await dbRun('UPDATE scenes SET include = ? WHERE scene_id = ?', [include ? 1 : 0, scene_id]);
        if (result.changes > 0) res.json({ message: `Scene include status updated.` });
        else res.status(404).json({ error: 'Scene not found.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update scene include status.' });
    }
});

sceneEditorApp.get('/api/agents/summarizer', async (req, res) => { // Changed from /api/agents/redux
    try {
        const rows = await dbAll("SELECT name, play_prompt FROM agents WHERE type = 'Summarizer' ORDER BY name ASC"); // Changed type from 'Redux' to 'Summarizer'
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

sceneEditorApp.post('/api/summarizer-inference', async (req, res) => { // Changed from /api/redux-inference
    const { messages, selected_model_id } = req.body;
    if (!messages || !Array.isArray(messages) || !selected_model_id) {
        return res.status(400).json({ error: 'Messages array and a model ID are required.' });
    }
    try {
        const generatedText = await inferChat(messages, selected_model_id, 500);
        res.json({ generated_text: generatedText });
    } catch (error) {
        res.status(500).json({ error: 'Failed to perform Summarizer inference.', details: error.message }); // Changed text
    }
});

// ... (all other dialog-related endpoints remain the same, just using the shared db helpers)

sceneEditorApp.get('/api/dialogs/:scene_id', async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM dialogs WHERE scene_id = ? ORDER BY sortcode ASC", [req.params.scene_id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add this new GET route for a single dialog by ID
sceneEditorApp.get('/api/dialog/:id', async (req, res) => {
    try {
        const dialog = await dbGet("SELECT * FROM dialogs WHERE id = ?", [req.params.id]);
        if (!dialog) {
            return res.status(404).json({ message: 'Dialog not found' });
        }
        res.json(dialog);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

sceneEditorApp.post('/api/dialogs', async (req, res) => {
    const { id, scene_id, ai_persona, user_persona, user_query, ai_response, comment } = req.body;
    try {
        if (id) {
            const result = await dbRun(
                "UPDATE dialogs SET scene_id = ?, ai_persona = ?, user_persona = ?, user_query = ?, ai_response = ?, comment = ? WHERE id = ?",
                [scene_id, ai_persona, user_persona, user_query, ai_response, comment, id]
            );
            res.json({ message: 'Dialog updated successfully', changes: result.changes });
        } else {
            const row = await dbGet("SELECT MAX(sortcode) AS max_sortcode FROM dialogs WHERE scene_id = ?", [scene_id]);
            const newSortcode = (row?.max_sortcode || 0) + 1;
            const result = await dbRun(
                "INSERT INTO dialogs (scene_id, ai_persona, user_persona, user_query, ai_response, comment, sortcode) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [scene_id, ai_persona, user_persona, user_query, ai_response, comment, newSortcode]
            );
            res.status(201).json({ id: result.lastID, message: 'Dialog created successfully' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

sceneEditorApp.delete('/api/dialogs/:id', async (req, res) => {
    try {
        const result = await dbRun("DELETE FROM dialogs WHERE id = ?", [req.params.id]);
        if (result.changes === 0) res.status(404).json({ message: 'Dialog not found' });
        else res.json({ message: 'Dialog deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

sceneEditorApp.put('/api/dialogs/reorder', async (req, res) => {
    const { dialogOrder } = req.body;
    if (!Array.isArray(dialogOrder)) return res.status(400).json({ error: 'Invalid dialog order data.' });
    try {
        for (const item of dialogOrder) {
            await dbRun("UPDATE dialogs SET sortcode = ? WHERE id = ?", [item.sortcode, item.id]);
        }
        res.json({ message: 'Dialog order updated successfully' });
    } catch (err) { res.status(500).json({ error: 'Failed to reorder dialogs: ' + err.message }); }
});


export default sceneEditorApp;
