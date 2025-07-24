// to_gemini/basic-inference/routes/apiRoutes.js
import express from 'express';
import {
    dbGet, dbAll, dbRun,
    getAgentByName, getUserAgentByName, getDialogsBySceneId,
    updateAgentState, updateAgentGoals,
    getScenes,
    queryMemoryEmbeddings,
    queryVectorEmbeddings,
    dbGetPrompt
} from '../../utils/db.js';
import { inferChat, streamInferChat, getEmbedding } from '../../utils/inferenceService.js';
import { countTokens } from '../../utils/tokenizer.js';

// --- Helper Functions ---

const getSceneTimelineText = async (currentSceneId) => {
    try {
        const allScenes = await getScenes();
        const currentScene = allScenes.find(s => s.scene_id === currentSceneId);
        if (!currentScene) return '';
        const relevantScenes = allScenes.filter(s => s.sortcode <= currentScene.sortcode && s.include === 1).sort((a, b) => a.sortcode - b.sortcode);
        if (relevantScenes.length === 0) return '';
        let timelineText = '';
        relevantScenes.forEach((scene, i) => {
            const timePrefix = i === 0 ? 'At the outset,' : `Approximately ${scene.after || 'some time'} later,`;
            timelineText += `${timePrefix} Scene Name: "${scene.name}". Canon: "${scene.canon || 'N/A'}". Synopsis: "${scene.synopsis || 'N/A'}".\n\n`;
        });
        return timelineText;
    } catch (error) {
        console.error('Error generating scene timeline text:', error);
        return 'Error generating timeline context.';
    }
};

const checkTokenLimit = (messages) => {
    const combinedText = messages.map(m => m.content).join('\n');
    const totalTokens = countTokens(combinedText);
    const maxContext = parseInt(process.env.DEFAULT_CONTEXT_LENGTH || '4096', 10);
    console.log(`[Token Check] Prompt tokens: ${totalTokens} / ${maxContext}`);
    if (totalTokens >= maxContext) {
        const errorMsg = `Input context is too long. The prompt has ${totalTokens} tokens, but the model's configured limit is ${maxContext} tokens.`;
        return { status: 413, json: { error: 'Payload Too Large', message: errorMsg, details: { promptTokens: totalTokens, maxContext: maxContext } } };
    }
    return null;
};


const buildPlayPrompt = async (scene_id, user_query, ai_persona_name, user_persona_name, pacingKey = '') => {
    if (!ai_persona_name || ai_persona_name.trim() === '') {
        throw new Error('AI Persona name is empty. Please select a Responder agent.');
    }
    if (!user_persona_name || user_persona_name.trim() === '') {
        throw new Error('User Persona name is empty. Please select an Actor agent.');
    }

    const aiAgent = await getAgentByName(ai_persona_name);
    const userAgent = await getUserAgentByName(user_persona_name);

    if (!aiAgent) {
        throw new Error(`AI Persona "${ai_persona_name}" not found in the database. Please ensure the agent exists.`);
    }
    if (!userAgent) {
        throw new Error(`User Persona "${user_persona_name}" not found in the database. Please ensure the agent exists.`);
    }

    // RAG Implementation
    let relevantMemories = '';
    const embeddingModel = process.env.EMBEDDING_MODEL_ID;
    if (embeddingModel && user_query.trim() !== '') {
        try {
            const queryEmbedding = await getEmbedding(user_query, embeddingModel);
            const k = 3;
            const distanceThreshold = 0.3;

            const memoryResults = await queryMemoryEmbeddings(queryEmbedding, distanceThreshold, k);
            const vectorResults = await queryVectorEmbeddings(queryEmbedding, distanceThreshold, k);

            const combinedResults = [...memoryResults, ...vectorResults]
                .sort((a, b) => a.distance - b.distance)
                .slice(0, k);

            if (combinedResults.length > 0) {
                relevantMemories = '\n\n--- RELEVANT MEMORIES ---\n' + combinedResults.map(r => `- ${r.content}`).join('\n');
            }
        } catch (error) {
            console.error("RAG Error:", error.message);
        }
    }

    const currentSceneDialogs = await getDialogsBySceneId(scene_id);
    const sceneTimelineText = await getSceneTimelineText(scene_id);

    let systemPrompt = `${aiAgent.canon || ''}`;
    if (aiAgent.state) systemPrompt += `\n\nYour current state:\n\n${aiAgent.state}`;
    if (aiAgent.goals) systemPrompt += `\n\nYour current goals:\n\n${aiAgent.goals}`;
    if (aiAgent.style_guide) systemPrompt += `\n\n--- STYLE GUIDE ---\n${aiAgent.style_guide}`;
    systemPrompt += `\n\n${aiAgent.play_prompt || ''}`;
    systemPrompt += relevantMemories;

    let hardPacingInstruction = '';
    if (pacingKey === 'BE_BRIEF_HARD') {
        hardPacingInstruction = await dbGetPrompt('bi_pacing_hard_be_brief');
    } else if (pacingKey === 'MATCH_BREVITY') {
        hardPacingInstruction = await dbGetPrompt('bi_pacing_hard_match_brevity');
    }

    if (hardPacingInstruction) {
        systemPrompt += `\n\n--- PACING INSTRUCTION ---\n${hardPacingInstruction}`;
    }
    
    systemPrompt += `\n\nThis is what you know about the User:\n\n${userAgent.canon || 'N/A'}`;
    systemPrompt += `\n\nThe following is the story so far:\n\n` + sceneTimelineText;

    const messages = [{ role: 'system', content: systemPrompt }];
    const historyDialogs = [...currentSceneDialogs];

    if (historyDialogs.length > 0 && historyDialogs[historyDialogs.length - 1].user_query === user_query) {
        historyDialogs.pop();
    }

    historyDialogs.forEach(d => {
        const agentResponseText = d.revised && d.revised.trim() !== '' ? d.revised : d.ai_response;
        // In this context, the 'user' is the one making the query (user_persona_name),
        // and the 'assistant' is the one responding (ai_persona_name).
        if (d.user_persona === user_persona_name) {
            messages.push({ role: 'user', content: d.user_query });
        } else {
            messages.push({ role: 'assistant', content: d.user_query });
        }

        if (d.ai_persona === ai_persona_name) {
            messages.push({ role: 'assistant', content: agentResponseText });
        } else {
            messages.push({ role: 'user', content: agentResponseText });
        }
    });
    
    messages.push({ role: 'user', content: user_query });

    return messages;
};

const buildAutoPrompt = async (scene_id, user_persona_name, ai_persona_name) => {
    if (!ai_persona_name || ai_persona_name.trim() === '') throw new Error('AI Persona name is empty.');
    if (!user_persona_name || user_persona_name.trim() === '') throw new Error('User Persona name is empty.');

    const aiAgent = await getAgentByName(ai_persona_name); // This is the Responder
    const userAgent = await getUserAgentByName(user_persona_name); // This is the Actor (who we are generating for)

    if (!aiAgent) throw new Error(`AI Persona "${ai_persona_name}" not found.`);
    if (!userAgent) throw new Error(`User Persona "${user_persona_name}" not found.`);

    const currentSceneDialogs = await getDialogsBySceneId(scene_id);
    const sceneTimelineText = await getSceneTimelineText(scene_id);

    // System prompt is from the perspective of the Actor (userAgent)
    let systemPrompt = `${userAgent.canon || ''}`;
    if (userAgent.state) systemPrompt += `\n\nYour current state:\n\n${userAgent.state}`;
    if (userAgent.goals) systemPrompt += `\n\nYour current goals:\n\n${userAgent.goals}`;
    if (userAgent.style_guide) systemPrompt += `\n\n--- STYLE GUIDE ---\n${userAgent.style_guide}`;
    systemPrompt += `\n\n${userAgent.play_prompt || ''}`;
    systemPrompt += `\n\nExplicitly address your words or actions to "${aiAgent.name}".`;
    systemPrompt += `\n\nThis is what you know about the other person:\n\n${aiAgent.canon || 'N/A'}`;
    systemPrompt += `\n\nThe following is the story so far:\n\n` + sceneTimelineText;
    
    const messages = [{ role: 'system', content: systemPrompt }];

    // Build the conversation history from the Actor's (userAgent's) perspective.
    // The Actor's past lines are 'assistant', the other person's lines are 'user'.
    currentSceneDialogs.forEach(d => {
        const responderResponseText = d.revised && d.revised.trim() !== '' ? d.revised : d.ai_response;

        // Handle the query part of the dialog turn
        if (d.user_persona === user_persona_name) { // If the Actor was the one querying
            messages.push({ role: 'assistant', content: d.user_query });
        } else { // If the Responder was the one querying
            messages.push({ role: 'user', content: d.user_query });
        }

        // Handle the response part of the dialog turn
        if (d.ai_persona === user_persona_name) { // If the Actor was the one responding
            messages.push({ role: 'assistant', content: responderResponseText });
        } else { // If the Responder was the one responding
            messages.push({ role: 'user', content: responderResponseText });
        }
    });

    messages.push({ role: 'user', content: "Your next move:" });

    return messages;
};


const setupApiRoutes = () => {
    const router = express.Router();

    // --- Data and State API Endpoints ---
    router.get('/scenes', async (req, res) => {
        try {
            const scenes = await dbAll('SELECT scene_id, name, synopsis, canon, sortcode, include FROM scenes ORDER BY sortcode ASC');
            res.json(scenes);
        } catch (err) { res.status(500).json({ error: 'Failed to fetch scenes' }); }
    });

    router.get('/scene-details/:id', async (req, res) => {
        try {
            const scene = await dbGet('SELECT * FROM scenes WHERE scene_id = ?', [req.params.id]);
            if (scene) res.json(scene);
            else res.status(404).json({ error: 'Scene not found' });
        } catch (err) { res.status(500).json({ error: 'Failed to fetch scene details' }); }
    });

    router.get('/dialogs/all/:sceneId', async (req, res) => {
        try {
            const dialogs = await dbAll('SELECT *, exemplary, revised FROM dialogs WHERE scene_id = ? ORDER BY sortcode ASC', [req.params.sceneId]);
            res.json(dialogs);
        } catch (err) { res.status(500).json({ error: 'Failed to fetch dialogs' }); }
    });

    router.get('/agents', async (req, res) => {
        const { type } = req.query;
        let query = 'SELECT id, name, type, play_prompt, forward_prompt, checker_prompt, awareness_prompt, planner_prompt, desc, state, goals, canon, created_at FROM agents';
        let params = [];
        if (type) {
            query += ' WHERE type = ?';
            params.push(type);
        }
        query += ' ORDER BY name ASC';
        try {
            const rows = await dbAll(query, params);
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/dialogs', async (req, res) => {
        const { id, scene_id, ai_persona, user_persona, user_query, ai_response, comment, exemplary, revised } = req.body;
        if (!scene_id || !ai_persona || !user_persona || user_query === undefined || ai_response === undefined) {
             return res.status(400).json({ error: 'Missing required fields for dialog.' });
        }

        try {
            if (id) {
                const result = await dbRun(
                    "UPDATE dialogs SET scene_id = ?, ai_persona = ?, user_persona = ?, user_query = ?, ai_response = ?, comment = ?, exemplary = ?, revised = ? WHERE id = ?",
                    [scene_id, ai_persona, user_persona, user_query, ai_response, comment, exemplary ? 1 : 0, revised, id]
                );
                if (result.changes === 0) return res.status(404).json({ message: 'Dialog not found for update' });
                res.json({ message: 'Dialog updated successfully', id: id });
            } else {
                const row = await dbGet("SELECT MAX(sortcode) AS max_sortcode FROM dialogs WHERE scene_id = ?", [scene_id]);
                const newSortcode = (row?.max_sortcode !== null) ? row.max_sortcode + 1 : 0;
                const result = await dbRun(
                    "INSERT INTO dialogs (scene_id, ai_persona, user_persona, user_query, ai_response, comment, sortcode, exemplary, revised) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [scene_id, ai_persona, user_persona, user_query, ai_response, comment, newSortcode, exemplary ? 1 : 0, revised]
                );
                res.status(201).json({ id: result.lastID, message: 'Dialog created successfully' });
            }
        } catch (err) { res.status(500).json({ error: 'Failed to save dialog', details: err.message }); }
    });

    router.post('/dialogs/insert-empty', async (req, res) => {
        const { scene_id, prev_dialog_id, next_dialog_id } = req.body;
        if (!scene_id) {
            return res.status(400).json({ error: 'Scene ID is required.' });
        }

        try {
            let dialogsInScene = await dbAll("SELECT id, sortcode FROM dialogs WHERE scene_id = ? ORDER BY sortcode ASC", [scene_id]);
            
            let newSortcode = 0;
            if (prev_dialog_id === null && next_dialog_id === null) {
                newSortcode = dialogsInScene.length > 0 ? dialogsInScene[dialogsInScene.length - 1].sortcode + 1 : 0;
            } else if (prev_dialog_id !== null) {
                const prevDialog = dialogsInScene.find(d => d.id === prev_dialog_id);
                const prevSortcode = prevDialog ? prevDialog.sortcode : -1;
                
                if (next_dialog_id !== null) {
                    const nextDialog = dialogsInScene.find(d => d.id === next_dialog_id);
                    const nextSortcode = nextDialog ? nextDialog.sortcode : prevSortcode + 1;
                    newSortcode = (prevSortcode + nextSortcode) / 2;
                } else {
                    newSortcode = prevSortcode + 1;
                }
            } else if (next_dialog_id !== null) {
                const nextDialog = dialogsInScene.find(d => d.id === next_dialog_id);
                const nextSortcode = nextDialog ? nextDialog.sortcode : 0;
                newSortcode = nextSortcode > 0 ? nextSortcode / 2 : 0;
            }

            const insertResult = await dbRun(
                "INSERT INTO dialogs (scene_id, ai_persona, user_persona, user_query, ai_response, comment, sortcode, exemplary, revised) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [scene_id, '', '', '', '', '', newSortcode, 0, '']
            );
            const newDialogId = insertResult.lastID;

            dialogsInScene = await dbAll("SELECT id, sortcode FROM dialogs WHERE scene_id = ? ORDER BY sortcode ASC", [scene_id]);

            for (let i = 0; i < dialogsInScene.length; i++) {
                if (dialogsInScene[i].sortcode !== i) {
                    await dbRun("UPDATE dialogs SET sortcode = ? WHERE id = ?", [i, dialogsInScene[i].id]);
                }
            }
            
            res.status(201).json({ id: newDialogId, message: 'Empty dialog inserted.' });

        } catch (err) {
            res.status(500).json({ error: 'Failed to insert empty dialog', details: err.message });
        }
    });

    router.delete('/dialogs/:id', async (req, res) => {
        try {
            const result = await dbRun("DELETE FROM dialogs WHERE id = ?", [req.params.id]);
            if (result.changes === 0) res.status(404).json({ message: 'Dialog not found' });
            else res.json({ message: 'Dialog deleted successfully' });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.put('/dialogs/reorder', async (req, res) => {
        const { dialogOrder } = req.body;
        if (!Array.isArray(dialogOrder)) return res.status(400).json({ error: 'Invalid dialog order data.' });
        try {
            for (const item of dialogOrder) {
                await dbRun("UPDATE dialogs SET sortcode = ? WHERE id = ?", [item.sortcode, item.id]);
            }
            res.json({ message: 'Dialog order updated successfully' });
        } catch (err) { res.status(500).json({ error: 'Failed to reorder dialogs: ' + err.message }); }
    });

    router.post('/vocab/create', async (req, res) => {
        const { dialog_id, selected_text, full_context_text, selected_model_id } = req.body;
        if (!dialog_id || !selected_text || !full_context_text || !selected_model_id) {
            return res.status(400).json({ error: 'dialog_id, selected_text, full_context_text, and selected_model_id are required.' });
        }

        try {
            const systemPrompt = await dbGetPrompt('bi_vocab_extractor');
            if (!systemPrompt) {
                return res.status(500).json({ error: 'Vocabulary extractor prompt not found in database.' });
            }

            const userPrompt = `The user has selected the snippet "${selected_text}" from the following full text:\n\n--- FULL TEXT ---\n${full_context_text}\n\n--- END FULL TEXT ---\n\nPlease analyze the selected snippet and provide its translation, description, and context based on the full text.`;
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            const modelResponse = await inferChat(messages, selected_model_id, 500);
            
            // Parse the three-line plain text response
            const lines = modelResponse.trim().split('\n');
            const translLine = lines.find(line => line.toLowerCase().startsWith('translation:'));
            const descLine = lines.find(line => line.toLowerCase().startsWith('description:'));
            const contextLine = lines.find(line => line.toLowerCase().startsWith('context:'));

            const transl = translLine ? translLine.substring('translation:'.length).trim() : 'Translation not found.';
            const desc = descLine ? descLine.substring('description:'.length).trim() : 'Description not found.';
            const context = contextLine ? contextLine.toLowerCase().substring('context:'.length).trim() : 'Context not found.';
            const expr = selected_text;
            const review_date = new Date().toISOString();

            const result = await dbRun(
                'INSERT INTO vocab (dialog_id, expr, transl, desc, context, review_date, familiarity) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [dialog_id, expr, transl, desc, context, review_date, 0.0]
            );

            res.status(201).json({ message: 'Vocab entry created successfully', id: result.lastID });

        } catch (error) {
            console.error('Error creating vocab entry:', error);
            res.status(500).json({ error: 'Failed to create vocab entry', details: error.message });
        }
    });

    // --- INFERENCE ROUTES ---
    router.post('/inference/suggest-korean-words', async (req, res) => {
        try {
            const { scene_id, selected_model_id } = req.body;
            const systemPrompt = await dbGetPrompt('bi_korean_word_suggester');
            if (!systemPrompt) {
                return res.status(500).json({ error: 'Korean word suggester prompt not found.' });
            }
            const dialogs = await getDialogsBySceneId(scene_id);
            const context = dialogs.map(d => `${d.user_persona}: ${d.user_query}\n${d.ai_persona}: ${d.ai_response}`).join('\n\n');

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Dialog Context:\n${context}` }
            ];

            const suggestions = await inferChat(messages, selected_model_id, 100);
            res.json({ suggestions: suggestions.split(',').map(w => w.trim()) });

        } catch (error) {
            res.status(500).json({ error: `Korean word suggestion failed: ${error.message}` });
        }
    });

    const handleInference = async (res, buildPromptFunc, args, stream = false, maxTokens = 1500) => {
        try {
            const messages = await buildPromptFunc(...args);
            const tokenError = checkTokenLimit(messages);
            if (tokenError) return res.status(tokenError.status).json(tokenError.json);

            if (stream) {
                await streamInferChat(messages, args[args.length - 1], res, maxTokens);
            } else {
                const response = await inferChat(messages, args[args.length - 1], maxTokens);
                res.json({ response });
            }
        } catch (error) {
            console.error(`Inference error: ${error.message}`);
            if (!res.headersSent) {
                res.status(500).json({ error: `Inference failed: ${error.message}` });
            }
        }
    };

    router.post('/inference/play', (req, res) => {
        const { scene_id, user_query, ai_persona_name, user_persona_name, selected_model_id, pacingKey } = req.body;
        handleInference(res, buildPlayPrompt, [scene_id, user_query, ai_persona_name, user_persona_name, pacingKey, selected_model_id], false);
    });

    router.post('/inference/play-stream', (req, res) => {
        const { scene_id, user_query, ai_persona_name, user_persona_name, selected_model_id, pacingKey } = req.body;
        handleInference(res, buildPlayPrompt, [scene_id, user_query, ai_persona_name, user_persona_name, pacingKey, selected_model_id], true);
    });

    router.post('/inference/auto-stream', (req, res) => {
        const { scene_id, user_persona_name, ai_persona_name, selected_model_id } = req.body;
        handleInference(res, buildAutoPrompt, [scene_id, user_persona_name, ai_persona_name, selected_model_id], true);
    });
    
    router.post('/inference/refine', async (req, res) => {
        try {
            const { agent_name, agent_response_text, selected_model_id, pacingKey } = req.body;
            const agent = await getAgentByName(agent_name);
            if (!agent || !agent.checker_prompt) {
                return res.status(404).json({ error: 'Agent or checker prompt not found.' });
            }
            let systemPrompt = agent.checker_prompt;
            if (pacingKey === 'BE_BRIEF_HARD') systemPrompt += `\n\n${await dbGetPrompt('bi_pacing_soft_be_brief')}`;
            if (pacingKey === 'MATCH_BREVITY') systemPrompt += `\n\n${await dbGetPrompt('bi_pacing_soft_match_brevity')}`;
            
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: agent_response_text }
            ];
            await streamInferChat(messages, selected_model_id, res);
        } catch (error) {
            res.status(500).json({ error: `Refine inference failed: ${error.message}` });
        }
    });

    router.post('/inference/think', async (req, res) => {
        try {
            const { scene_id, agent_name, selected_model_id } = req.body;
            const agent = await getAgentByName(agent_name);
            const dialogs = await getDialogsBySceneId(scene_id);
            const recentEvents = dialogs.slice(-2).map(d => `User: ${d.user_query}\nAgent: ${d.ai_response}`).join('\n');
            const awarenessPrompt = agent.awareness_prompt || await dbGetPrompt('bi_default_awareness_prompt');
            const messages = [
                { role: 'system', content: awarenessPrompt },
                { role: 'user', content: `Old State:\n${agent.state || 'None'}\n\nRecent Events:\n${recentEvents}` }
            ];
            const newState = await inferChat(messages, selected_model_id, 300);
            await updateAgentState(agent.id, newState);
            res.json({ new_state: newState });
        } catch (error) {
            res.status(500).json({ error: `Think inference failed: ${error.message}` });
        }
    });

    router.post('/inference/plan', async (req, res) => {
        try {
            const { scene_id, agent_name, selected_model_id } = req.body;
            const agent = await getAgentByName(agent_name);
            const dialogs = await getDialogsBySceneId(scene_id);
            const recentEvents = dialogs.slice(-2).map(d => `User: ${d.user_query}\nAgent: ${d.ai_response}`).join('\n');
            const plannerPrompt = agent.planner_prompt || await dbGetPrompt('bi_default_planner_prompt');
            const messages = [
                { role: 'system', content: plannerPrompt },
                { role: 'user', content: `Old Goals:\n${agent.goals || 'None'}\n\nRecent Events:\n${recentEvents}` }
            ];
            const newGoals = await inferChat(messages, selected_model_id, 400);
            await updateAgentGoals(agent.id, newGoals);
            res.json({ new_goals: newGoals });
        } catch (error) {
            res.status(500).json({ error: `Plan inference failed: ${error.message}` });
        }
    });

    router.post('/inference/wonder', async (req, res) => {
        const { scene_id, ai_persona_name, user_persona_name, selected_model_id } = req.body;
        const wonderQuery = "What is a surprising and dramatic twist that could happen right now?";
        handleInference(res, buildPlayPrompt, [scene_id, wonderQuery, ai_persona_name, user_persona_name, '', selected_model_id], true);
    });

    // NEW: Evolve inference endpoint
    router.post('/inference/evolve', async (req, res) => {
        try {
            const { scene_id, ai_persona_name, selected_model_id } = req.body;
            if (!ai_persona_name || !selected_model_id) {
                return res.status(400).json({ error: 'AI Persona name and model ID are required.' });
            }

            const aiAgent = await getAgentByName(ai_persona_name);
            if (!aiAgent) {
                return res.status(404).json({ error: `AI Persona "${ai_persona_name}" not found.` });
            }

            const evolveSystemPrompt = await dbGetPrompt('bi_evolve_play_prompt');
            if (!evolveSystemPrompt) {
                throw new Error('Prompt "bi_evolve_play_prompt" not found in database.');
            }

            let contextMessageContent = `Agent Name: ${aiAgent.name}\n`;
            if (aiAgent.canon) contextMessageContent += `Agent Canon: ${aiAgent.canon}\n`;
            if (aiAgent.state) contextMessageContent += `Agent State: ${aiAgent.state}\n`;
            if (aiAgent.goals) contextMessageContent += `Agent Goals: ${aiAgent.goals}\n`;

            const sceneTimelineText = await getSceneTimelineText(scene_id);
            if (sceneTimelineText) contextMessageContent += `\nScene Timeline:\n${sceneTimelineText}\n`;

            const userPromptToEvolve = aiAgent.play_prompt || '';

            const messages = [
                { role: 'system', content: evolveSystemPrompt },
                { role: 'user', content: `Current Play Prompt to Evolve:\n${userPromptToEvolve}\n\nContext for Evolution:\n${contextMessageContent.trim()}\n\nNew Play Prompt:` }
            ];

            const tokenError = checkTokenLimit(messages);
            if (tokenError) return res.status(tokenError.status).json(tokenError.json);

            await streamInferChat(messages, selected_model_id, res, 1000);
        } catch (error) {
            console.error(`Evolve inference error: ${error.message}`);
            if (!res.headersSent) {
                res.status(500).json({ error: `Evolve inference failed: ${error.message}` });
            }
        }
    });

    // --- State Management ---
    router.post('/state', async (req, res) => {
        try {
            const { domain, key, value } = req.body;
            await dbRun('INSERT OR REPLACE INTO state (domain, key, value) VALUES (?, ?, ?)', [domain, key, value]);
            res.status(200).json({ message: 'State saved successfully.' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to save state' });
        }
    });

     router.get('/state/:domain/:key', async (req, res) => {
        try {
            const { domain, key } = req.params;
            const row = await dbGet('SELECT value FROM state WHERE domain = ? AND key = ?', [domain, key]);
            if (row) {
                res.json({ value: row.value });
            } else {
                res.status(404).json({ error: 'State not found' });
            }
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch state' });
        }
    });

    return router;
};

export default setupApiRoutes;