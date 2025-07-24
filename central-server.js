// central-server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import { initializeDb } from './utils/db.js';


dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT_SCENE_EDITOR || 3000;

async function startServer() {
    try {
        console.log('Central server is initializing the database...');
        await initializeDb();
        console.log('Database initialization complete.');

        console.log('Setting up global middleware...');
        app.use(cors());
        app.use(express.json());
        app.use(express.static(path.join(__dirname, 'public')));

        console.log('Loading sub-applications...');

        const sceneEditorApp = (await import('./scene-edit/app.js')).default;
        app.use('/scene-editor', sceneEditorApp);
        const agentEditorApp = (await import('./agent-edit/app.js')).default;
        app.use('/agent-editor', agentEditorApp);
        const basicInferenceApp = (await import('./basic-inference/app.js')).default;
        app.use('/basic-inference', basicInferenceApp);
        const stylerApp = (await import('./styler/app.js')).default;
        app.use('/styler', stylerApp);
        const generatorApp = (await import('./generator/app.js')).default;
        app.use('/generator', generatorApp);
        const vectorExpertApp = (await import('./vector-expert/app.js')).default;
        app.use('/vector-expert', vectorExpertApp);
        const settingsApp = (await import('./settings/app.js')).default;
        app.use('/settings', settingsApp);
        console.log('All sub-applications loaded.');

        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        app.listen(port, () => {
            console.log(`SCIL Central server listening on port ${port}`);
            console.log(`Landing page available at: http://localhost:${port}/`);

        });

    } catch (error) {
        console.error("CRITICAL: Failed to start the central server.", error);
        process.exit(1);
    }
}

startServer();