// scil/utils/lmStudioService.js
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from the central .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_BASE_URL || 'http://127.0.0.1:1234/v1';
const LM_STUDIO_API_KEY = process.env.LM_STUDIO_API_KEY || 'lm-studio';

/**
 * Performs a non-streaming chat completion inference with LM Studio.
 * @param {Array<Object>} messages - Array of message objects ({role: string, content: string}).
 * @param {string} modelId - The ID of the LM Studio model to use.
 * @param {number} maxTokens - Maximum tokens for the response.
 * @returns {Promise<string>} The generated text content.
 */
export const inferChat = async (messages, modelId, maxTokens = 2000) => {
    try {
        const response = await axios.post(`${LM_STUDIO_BASE_URL}/chat/completions`, {
            model: modelId,
            messages: messages,
            temperature: 0.7, // Default temperature
            max_tokens: maxTokens,
            stream: false,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LM_STUDIO_API_KEY}`
            }
        });

        if (!response.data || !response.data.choices || response.data.choices.length === 0) {
            throw new Error('No response or choices from LM Studio chat completion.');
        }

        return response.data.choices[0].message.content || '';
    } catch (error) {
        console.error('Error during LM Studio chat inference:', error.message);
        if (error.response) {
            console.error('LM Studio API Error Response Data:', error.response.data);
            console.error('LM Studio API Error Status:', error.response.status);
        } else if (error.request) {
            console.error('LM Studio API Request Error: No response received. Is LM Studio running and accessible?', error.request);
        }
        throw new Error(`LM Studio chat inference failed: ${error.message}`);
    }
};

/**
 * Performs a streaming chat completion inference with LM Studio.
 * @param {Array<Object>} messages - Array of message objects ({role: string, content: string}).
 * @param {string} modelId - The ID of the LM Studio model to use.
 * @param {Object} res - Express response object for streaming.
 * @param {number} maxTokens - Maximum tokens for the response.
 */
export const streamInferChat = async (messages, modelId, res, maxTokens = 1000) => {
    try {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });

        const streamResponse = await axios.post(`${LM_STUDIO_BASE_URL}/chat/completions`, {
            model: modelId,
            messages: messages,
            temperature: 0.7,
            max_tokens: maxTokens,
            stream: true,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LM_STUDIO_API_KEY}`
            },
            responseType: 'stream', // Important for streaming with axios
        });

        let buffer = ''; // Buffer to handle partial lines

        streamResponse.data.on('data', (chunk) => {
            buffer += chunk.toString(); // Append chunk to buffer

            // Process line by line
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep the last, potentially incomplete line in buffer

            for (const line of lines) {
                if (line.trim() === '') continue; // Skip empty lines

                if (line.startsWith('data: ')) {
                    const jsonString = line.substring(6).trim(); // Get JSON part, trim whitespace

                    // --- CRITICAL FIX HERE: Handle [DONE] message ---
                    if (jsonString === '[DONE]') {
                        console.log("LM Studio stream: [DONE] received.");
                        // Do not parse [DONE] as JSON
                        // Frontend `readStream` will handle the actual end when `res.end()` is called
                        continue; // Skip to next line
                    }

                    try {
                        const parsedData = JSON.parse(jsonString);
                        const content = parsedData.choices?.[0]?.delta?.content || '';
                        if (content) {
                            res.write(`data: ${JSON.stringify({ content: content })}\n\n`);
                        }
                    } catch (e) {
                        console.error('Error parsing stream JSON from LM Studio:', e);
                        // Send an error message to the client for this specific chunk issue
                        res.write(`data: ${JSON.stringify({ error: 'Stream parsing error from LM Studio', message: e.message, problematicLine: line })}\n\n`);
                        // Optionally, you might want to end the response here if parsing errors are critical
                        // res.end();
                        // return;
                    }
                } else {
                    // This case handles lines that don't start with 'data: ' but might contain data or errors
                    // console.warn('Unexpected line in LM Studio stream:', line);
                    // You could potentially send this raw line to the client as well, or just log it.
                }
            }
        });

        streamResponse.data.on('end', () => {
            // After all data is received and processed, send the final [DONE] or simply end the response
            res.end();
            console.log("Stream ended successfully from LM Studio service.");
        });

        streamResponse.data.on('error', (error) => {
            console.error('Stream error from LM Studio:', error);
            // Send an error message before ending
            if (!res.headersSent) {
                 res.writeHead(500, { 'Content-Type': 'application/json' }); // Change header if not SSE
                 res.end(JSON.stringify({ error: 'LM Studio stream error', message: error.message || 'Unknown stream error' }));
            } else {
                res.write(`data: ${JSON.stringify({ error: 'LM Studio stream error', message: error.message || 'Unknown stream error' })}\n\n`);
                res.end();
            }
        });

    } catch (error) {
        console.error('Error setting up LM Studio chat stream:', error.message);
        if (error.response) {
            console.error('LM Studio API Error Response Data:', error.response.data);
            console.error('LM Studio API Error Status:', error.response.status);
        } else if (error.request) {
            console.error('LM Studio API Request Error: No response received. Is LM Studio running and accessible?', error.request);
        }
        if (!res.headersSent) {
            res.status(500).json({ error: `LM Studio streaming failed: ${error.message}` });
        } else {
            // If headers are already sent (e.g., SSE connection established),
            // send the error as a data event and then end the stream.
            res.write(`data: ${JSON.stringify({ error: 'LM Studio streaming failed', message: error.message })}\n\n`);
            res.end();
        }
    }
};


/**
 * Generates an embedding for a given input text using LM Studio.
 * @param {string} input - The text to embed.
 * @param {string} modelId - The ID of the embedding model to use.
 * @returns {Promise<number[]>} The embedding vector (array of numbers).
 */
export const getEmbedding = async (input, modelId) => {
    try {
        const response = await axios.post(`${LM_STUDIO_BASE_URL}/embeddings`, {
            model: modelId,
            input: input,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LM_STUDIO_API_KEY}`
            }
        });

        if (!response.data || response.data.data.length === 0 || !response.data.data[0].embedding) {
            throw new Error('No embedding data received from LM Studio.');
        }

        const embedding = response.data.data[0].embedding;

        const isZeroVector = embedding.every(val => val === 0);
        if (isZeroVector) {
            console.warn('WARNING: LM Studio returned an all-zero embedding vector. This may affect similarity search results.');
        }

        return embedding;
    } catch (error) {
        console.error('Error generating embedding with LM Studio:', error.message);
        if (error.response) {
            console.error('LM Studio API Error Response Data:', error.response.data);
            console.error('LM Studio API Error Status:', error.response.status);
        } else if (error.request) {
            console.error('LM Studio API Request Error: No response received. Is LM Studio running and accessible?', error.request);
        }
        throw new Error(`LM Studio embedding generation failed: ${error.message}`);
    }
};

/**
 * Fetches available models from LM Studio.
 * @returns {Promise<Object>} The models data from LM Studio.
 */
export const fetchLmStudioModels = async () => {
    try {
        const response = await axios.get(`${LM_STUDIO_BASE_URL}/models`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LM_STUDIO_API_KEY}`
            }
        });
        return response.data;
    }
    catch (error) {
        console.error('Error fetching models from LM Studio:', error.message);
        if (error.response) {
            console.error('LM Studio API Error Response Data:', error.response.data);
            console.error('LM Studio API Error Status:', error.response.status);
        } else if (error.request) {
            console.error('LM Studio API Request Error: No response received. Is LM Studio running and accessible?', error.request);
        } else {
            console.error('LM Studio API Error:', error.message);
        }
        throw new Error('Failed to fetch models from LM Studio. Ensure LM Studio is running and API server is enabled.');
    }
};
