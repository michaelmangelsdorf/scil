// agent-edit/utils.js
import path from 'path';
import { fileURLToPath } from 'url';

export const fileURLTo__dirname = (importMetaUrl) => {
    const __filename = fileURLToPath(importMetaUrl);
    return path.dirname(__filename);
};