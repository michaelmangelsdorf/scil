// basic-inference/app.js
import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { fetchModels, isUsingLmStudio, getLocalModelInitStatus } from '../utils/inferenceService.js';
import setupApiRoutes from './routes/apiRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const basicInferenceApp = express();

basicInferenceApp.use(express.json());
basicInferenceApp.use(cors());
basicInferenceApp.use(express.static(path.join(__dirname, 'public')));

basicInferenceApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API to get available models (UPDATED WITH CHECK)
basicInferenceApp.get('/api/lm-studio/models', async (req, res) => {
    try {
        const lmStudioActive = await isUsingLmStudio();
        if (!lmStudioActive) {
            const localStatus = getLocalModelInitStatus();
            if (localStatus === 'failed') {
                // Send a specific error code that the frontend can check for.
                return res.status(503).json({
                    error: 'Local models failed to load. Please check your .env file and server logs.',
                    localModelError: true // Flag for the frontend
                });
            }
        }
        
        const modelsData = await fetchModels();
        // Add the flag to the response
        res.json({ ...modelsData, isLmStudio: lmStudioActive });
    } catch (error) {
        console.error('Error fetching models (basic-inference app):', error.message);
        res.status(500).json({ error: `Failed to fetch models: ${error.message}` });
    }
});

basicInferenceApp.use('/api', setupApiRoutes());

export default basicInferenceApp;
