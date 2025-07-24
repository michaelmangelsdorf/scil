// styler/app.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbAll, dbRun, dbGetPrompt } from '../utils/db.js';
import { inferChat, fetchModels, isUsingLmStudio, getLocalModelInitStatus } from '../utils/inferenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express.Router();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API to get available models
app.get('/api/lm-studio/models', async (req, res) => {
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
            data: modelsData.data,
            preferredModel: modelsData.preferredInferenceModelId,
            isLmStudio: lmStudioActive
        });
    } catch (error) {
        console.error('Error fetching models (styler app):', error.message);
        res.status(500).json({ error: `Failed to fetch models: ${error.message}` });
    }
});

// API to get all agents of type 'Person'
app.get('/api/agents', async (req, res) => {
    try {
        const agents = await dbAll("SELECT id, name, style_guide FROM agents WHERE type = 'Person' ORDER BY name ASC");
        res.json(agents);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch agents' });
    }
});

// API to get all dialogs with non-empty comments for a specific agent
app.get('/api/dialogs/:agentName', async (req, res) => {
    try {
        const dialogs = await dbAll(
            "SELECT id, user_query, ai_response, revised, comment, sortcode, exemplary FROM dialogs WHERE ai_persona = ? AND comment IS NOT NULL AND comment != '' ORDER BY id ASC",
            [req.params.agentName]
        );
        res.json(dialogs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch dialogs' });
    }
});

// NEW: API endpoint to update dialog feedback (comment and revised)
app.put('/api/dialogs/:dialogId', async (req, res) => {
    const { dialogId } = req.params;
    const { comment, revised } = req.body;

    if (comment === undefined || revised === undefined) {
        return res.status(400).json({ error: 'Comment and revised fields are required.' });
    }

    try {
        const result = await dbRun(
            "UPDATE dialogs SET comment = ?, revised = ? WHERE id = ?",
            [comment, revised, dialogId]
        );
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Dialog not found.' });
        }
        res.json({ message: 'Dialog feedback updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update dialog feedback.' });
    }
});


// API to generate a style guide from dialogs
app.post('/api/generate-style-guide', async (req, res) => {
    const { dialogs, selected_model_id } = req.body;
    if (!dialogs || dialogs.length === 0 || !selected_model_id) {
        return res.status(400).json({ error: 'Dialogs and a model ID are required.' });
    }

    try {
        const systemPrompt = await dbGetPrompt('styler_main_prompt');
        if (!systemPrompt) {
            throw new Error('Prompt "styler_main_prompt" not found in database. Ensure initializeDb is run.');
        }

        const exemplaryDialogs = dialogs.filter(d => d.exemplary);

        let userPrompt = "Analyze the following dialogs to synthesize the style guide.\n\n--- ALL DIALOGS FOR RULE ANALYSIS ---\n";
        dialogs.forEach((dialog, index) => {
            userPrompt += `[Dialog ${index + 1}]\n`;
            userPrompt += `Agent Response: "${dialog.ai_response}"\n`;
            userPrompt += `User Comment: "${dialog.comment}"\n\n`;
        });

        if (exemplaryDialogs.length > 0) {
            userPrompt += "\n--- EXEMPLARY DIALOGS FOR FEW-SHOT EXAMPLES ---\n";
            exemplaryDialogs.forEach((dialog, index) => {
                userPrompt += `[Exemplary Dialog ${index + 1}]\n`;
                userPrompt += `User Query: "${dialog.user_query}"\n`;
                userPrompt += `Agent Response: "${dialog.ai_response}"\n\n`;
            });
        }
        
        userPrompt += "Synthesized Style Guide:";

        const styleGuide = await inferChat(
            [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            selected_model_id,
            1500
        );
        res.json({ style_guide: styleGuide });

    } catch (error) {
        res.status(500).json({ error: 'Failed to generate style guide', details: error.message });
    }
});

// API to save the style guide to an agent
app.post('/api/save-style-guide', async (req, res) => {
    const { agentId, styleGuide } = req.body;
    if (!agentId || styleGuide === undefined) {
        return res.status(400).json({ error: 'Agent ID and style guide are required.' });
    }
    try {
        await dbRun('UPDATE agents SET style_guide = ? WHERE id = ?', [styleGuide, agentId]);
        res.json({ message: 'Style guide saved successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save style guide' });
    }
});

export default app;