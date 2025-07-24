// vector-expert/app.js
import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

import { dbRun, dbGet, dbAll, queryVectorEmbeddings, queryMemoryEmbeddings } from '../utils/db.js';
import { fetchModels, getEmbedding, streamInferChat } from '../utils/inferenceService.js'; // UPDATED

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vectorExpertApp = express();

vectorExpertApp.use(express.json());
vectorExpertApp.use(cors());
vectorExpertApp.use(express.static(path.join(__dirname, 'public')));

vectorExpertApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API to get available models (now uses abstraction layer)
vectorExpertApp.get('/api/lm-studio/models', async (req, res) => {
    try {
        const modelsData = await fetchModels(); // UPDATED
        res.json(modelsData); // The service already formats this correctly
    }
    catch (error) {
        console.error('Error fetching models from LM Studio (vector-expert app):', error.message);
        res.status(500).json({ error: `Failed to fetch models: ${error.message}` });
    }
});

// ... (The rest of the file remains the same, as the function names are identical) ...

// Endpoint to get all scenes (now uses centralized db functions)
vectorExpertApp.get('/api/scenes', async (req, res) => {
    const query = "SELECT scene_id, name, synopsis, canon, sortcode, after, include, created_at FROM scenes ORDER BY name ASC";
    try {
        const rows = await dbAll(query); // Using dbAll from centralized db.js
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint to get all agents (now uses centralized db functions)
vectorExpertApp.get('/api/agents', async (req, res) => {
    const query = "SELECT id, name, type, play_prompt, forward_prompt, checker_prompt, awareness_prompt, planner_prompt, desc, state, goals, created_at FROM agents ORDER BY name ASC";
    try {
        const rows = await dbAll(query); // Using dbAll from centralized db.js
        console.log('[vector-expert/app.js] Fetched agents from DB:', rows);
        res.json(rows);
    } catch (err) {
        console.error('[vector-expert/app.js] Error fetching agents:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint to generate and store embeddings (now uses centralized embedding service)
vectorExpertApp.post('/api/embeddings/generate-and-store', async (req, res) => {
    const { content, scene_id, agent_id, model_id } = req.body;

    if (!content || !model_id) {
        return res.status(400).json({ error: 'Missing content or model_id for embedding generation.' });
    }

    try {
        const embedding = await getEmbedding(content, model_id);

        const embeddingString = JSON.stringify(embedding);

        const insertQuery = `
            INSERT INTO memory_embeddings (scene_id, agent_id, content, embedding)
            VALUES (?, ?, ?, ?)
        `;
        const result = await dbRun(insertQuery, [scene_id || null, agent_id || null, content, embeddingString]);

        res.status(201).json({
            message: 'Embedding generated and stored successfully in memory.',
            id: result.lastID,
            embedding_length: embedding.length
        });

    } catch (error) {
        console.error('Error generating or storing embedding in memory:', error);
        res.status(500).json({ error: `Failed to generate or store embedding in memory: ${error.message}` });
    }
});


vectorExpertApp.post('/api/embeddings/get-raw-embedding', async (req, res) => {
    const { input, model_id } = req.body;

    if (!input || !model_id) {
        return res.status(400).json({ error: 'Missing input text or model_id for raw embedding generation.' });
    }

    try {
        const embedding = await getEmbedding(input, model_id);

        res.json({ embedding: embedding });

    } catch (error) {
        console.error('Error getting raw embedding from LM Studio:', error);
        res.status(500).json({ error: `Failed to get raw embedding from LM Studio: ${error.message}` });
    }
});


// Endpoint to perform vector search against both tables (now uses centralized embedding and db query functions)
vectorExpertApp.post('/api/embeddings/search', async (req, res) => {
    const { query_text, model_id, k_neighbors = 5 } = req.body;

    if (!query_text || !model_id) {
        return res.status(400).json({ error: 'Missing query_text or model_id for vector search.' });
    }

    try {
        const queryEmbedding = await getEmbedding(query_text, model_id);

        const memoryResults = await queryMemoryEmbeddings(queryEmbedding, 1.0, k_neighbors);

        const vectorResults = await queryVectorEmbeddings(queryEmbedding, 1.0, k_neighbors);

        const formatResults = (rows, source) => rows.map(row => ({
            id: row.id,
            scene_id: row.scene_id,
            scene_name: row.scene_name,
            agent_id: row.agent_id,
            agent_name: row.agent_name,
            content: row.content,
            distance: row.distance,
            source: source
        }));

        const formattedMemoryResults = formatResults(memoryResults, "memory");
        const formattedVectorResults = formatResults(vectorResults, "vector");

        res.json({
            message: 'Vector search completed successfully.',
            memory_results: formattedMemoryResults,
            vector_results: formattedVectorResults
        });

    } catch (error) {
        console.error('Unhandled error during vector search (LM Studio or other):', error);
        res.status(500).json({ error: `Failed to perform vector search: ${error.message}` });
    }
});

// Endpoint to teach all dialogs (only affects vector_embeddings) (now uses centralized embedding service and db functions)
vectorExpertApp.post('/api/embeddings/teach-dialogs', async (req, res) => {
    const { model_id } = req.body;

    if (!model_id) {
        return res.status(400).json({ error: 'Embedding model_id is required to teach dialogs.' });
    }

    let totalDialogsProcessed = 0;
    let totalEmbeddingsStored = 0;

    try {
        await dbRun("DELETE FROM vector_embeddings");
        console.log('Cleared all existing vector embeddings from `vector_embeddings` table.');

        const dialogs = await dbAll("SELECT id, scene_id, ai_persona, user_persona, user_query, ai_response, comment, sortcode, created_at FROM dialogs");
        const agents = await dbAll("SELECT id, name, type, play_prompt, forward_prompt, checker_prompt, awareness_prompt, planner_prompt, desc, state, goals, created_at FROM agents");

        const agentNameToIdMap = new Map(agents.map(agent => [agent.name, agent.id]));

        for (const dialog of dialogs) {
            totalDialogsProcessed++;
            const aiPersonaId = agentNameToIdMap.get(dialog.ai_persona) || null;

            if (dialog.user_query && dialog.user_query.trim() !== '') {
                try {
                    const userQueryEmbedding = await getEmbedding(dialog.user_query, model_id);
                    const userQueryEmbeddingString = JSON.stringify(userQueryEmbedding);

                    await dbRun(
                        "INSERT INTO vector_embeddings (scene_id, agent_id, content, embedding) VALUES (?, ?, ?, ?)",
                        [dialog.scene_id, null, dialog.user_query, userQueryEmbeddingString]
                    );
                    totalEmbeddingsStored++;
                } catch (embedErr) {
                    console.error(`Error embedding user query for dialog ${dialog.id}:`, embedErr.message);
                }
            }

            if (dialog.ai_response && dialog.ai_response.trim() !== '') {
                try {
                    const aiResponseEmbedding = await getEmbedding(dialog.ai_response, model_id);
                    const aiResponseEmbeddingString = JSON.stringify(aiResponseEmbedding);

                    await dbRun(
                        "INSERT INTO vector_embeddings (scene_id, agent_id, content, embedding) VALUES (?, ?, ?, ?)",
                        [dialog.scene_id, aiPersonaId, dialog.ai_response, aiResponseEmbeddingString]
                    );
                    totalEmbeddingsStored++;
                } catch (embedErr) {
                    console.error(`Error embedding AI response for dialog ${dialog.id}:`, embedErr.message);
                }
            }
        }

        res.json({
            message: 'Dialogs processed and embeddings stored successfully in `vector_embeddings` table.',
            totalDialogsProcessed: totalDialogsProcessed,
            totalEmbeddingsStored: totalEmbeddingsStored
        });

    } catch (error) {
        console.error('Error teaching dialogs:', error);
        res.status(500).json({ error: `Failed to teach dialogs: ${error.message}` });
    }
});


// NEW: Streaming Playwright inference endpoint
vectorExpertApp.post('/api/playwright-inference-stream', async (req, res) => {
    const { playwright_agent_id, model_id, user_query, scene_id, agent_id } = req.body;

    if (!playwright_agent_id || !model_id || !user_query) {
        return res.status(400).json({ error: 'Missing playwright_agent_id, model_id, or user_query for Playwright inference.' });
    }

    try {
        const playwrightAgent = await dbGet("SELECT play_prompt FROM agents WHERE id = ?", [playwright_agent_id]);
        if (!playwrightAgent || !playwrightAgent.play_prompt) {
            return res.status(404).json({ error: 'Playwright agent not found or missing play_prompt.' });
        }

        const messages = [{ role: "system", content: playwrightAgent.play_prompt }];

        const storyNameRow = await dbGet('SELECT value FROM state WHERE domain = ? AND key = ?', ['world_data', 'story_name']);
        const storyOutlineRow = await dbGet('SELECT value FROM state WHERE domain = ? AND key = ?', ['world_data', 'story_outline']);

        const storyName = storyNameRow ? storyNameRow.value : null;
        const storyOutline = storyOutlineRow ? storyOutlineRow.value : null;

        if (storyName || storyOutline) {
            let worldDataContext = 'World Data:\n';
            if (storyName) worldDataContext += `Story Name: ${storyName}\n`;
            if (storyOutline) worldDataContext += `Story Outline: ${storyOutline}\n`;
            messages.push({ role: "user", content: worldDataContext.trim() });
            messages.push({ role: "assistant", content: "Acknowledged world data." });
        }

        let sceneContext = '';
        if (scene_id) {
            const scene = await dbGet("SELECT name, synopsis, canon FROM scenes WHERE scene_id = ? AND include = 1", [scene_id]);
            if (scene) {
                sceneContext += `Scene Name: ${scene.name}\n`;
                if (scene.canon) sceneContext += `Scene Canon: ${scene.canon}\n`;
                if (scene.synopsis) sceneContext += `Scene Synopsis: ${scene.synopsis}\n`;

                const dialogs = await dbAll("SELECT user_query, ai_response FROM dialogs WHERE scene_id = ? ORDER BY sortcode ASC", [scene_id]);
                dialogs.forEach(dialog => {
                    sceneContext += `User: ${dialog.user_query}\n`;
                    sceneContext += `AI: ${dialog.ai_response}\n`;
                });
            }
        } else {
            const allScenes = await dbAll("SELECT name, synopsis, canon FROM scenes WHERE include = 1");
            allScenes.forEach(scene => {
                sceneContext += `Scene Name: ${scene.name}\n`;
                if (scene.canon) sceneContext += `Scene Canon: ${scene.canon}\n`;
                if (scene.synopsis) sceneContext += `Scene Synopsis: ${scene.synopsis}\n`;
                sceneContext += '---\n';
            });
        }
        if (sceneContext) {
            messages.push({ role: "user", content: `Scene Context:\n${sceneContext.trim()}` });
            messages.push({ role: "assistant", content: "Acknowledged scene context." });
        }

        let agentContext = '';
        if (agent_id) {
            const agent = await dbGet("SELECT name, desc, state, goals, forward_prompt, checker_prompt, awareness_prompt, planner_prompt FROM agents WHERE id = ?", [agent_id]);
            if (agent) {
                agentContext += `Agent Name: ${agent.name}\n`;
                if (agent.desc) agentContext += `Agent Description: ${agent.desc}\n`;
                if (agent.state) agentContext += `Agent State: ${agent.state}\n`;
                if (agent.goals) agentContext += `Agent Goals: ${agent.goals}\n`;
                if (agent.forward_prompt) agentContext += `Agent Forward Prompt: ${agent.forward_prompt}\n`;
                if (agent.checker_prompt) agentContext += `Agent Checker Prompt: ${agent.checker_prompt}\n`;
                if (agent.awareness_prompt) agentContext += `Agent Awareness Prompt: ${agent.awareness_prompt}\n`;
                if (agent.planner_prompt) agentContext += `Agent Planner Prompt: ${agent.planner_prompt}\n`;
            }
        } else {
            const allAgents = await dbAll("SELECT name, desc, state, goals, forward_prompt, checker_prompt, awareness_prompt, planner_prompt FROM agents");
            allAgents.forEach(agent => {
                agentContext += `Agent Name: ${agent.name}\n`;
                if (agent.desc) agentContext += `Agent Description: ${agent.desc}\n`;
                if (agent.state) agentContext += `Agent State: ${agent.state}\n`;
                if (agent.goals) agentContext += `Agent Goals: ${agent.goals}\n`;
                if (agent.forward_prompt) agentContext += `Agent Forward Prompt: ${agent.forward_prompt}\n`;
                if (agent.checker_prompt) agentContext += `Agent Checker Prompt: ${agent.checker_prompt}\n`;
                if (agent.awareness_prompt) agentContext += `Agent Awareness Prompt: ${agent.awareness_prompt}\n`;
                if (agent.planner_prompt) agentContext += `Agent Planner Prompt: ${agent.planner_prompt}\n`;
                agentContext += '---\n';
            });
        }
        if (agentContext) {
            messages.push({ role: "user", content: `Agent Context:\n${agentContext.trim()}` });
            messages.push({ role: "assistant", content: "Acknowledged agent context." });
        }

        messages.push({ role: "user", content: user_query });

        await streamInferChat(messages, model_id, res, 1500);

    } catch (error) {
        console.error('Error during Playwright streaming inference:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: `Failed to perform Playwright streaming inference: ${error.message}` });
        } else {
            res.write(`data: ${JSON.stringify({ error: 'Playwright streaming failed', message: error.message })}\n\n`);
            res.end();
        }
    }
});


export default vectorExpertApp;