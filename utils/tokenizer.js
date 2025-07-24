import { get_encoding } from '@dqbd/tiktoken';

// For Llama 3 and other modern models like GPT-4, 'cl100k_base' is the correct encoding to use.
const tokenizer = get_encoding('cl100k_base');

console.log('Tiktoken tokenizer for Llama 3 loaded successfully.');

/**
 * Counts the tokens in a given text using the Tiktoken library (cl100k_base).
 * @param {string} text The text to count tokens for.
 * @returns {number} The number of tokens.
 */
export const countTokens = (text) => {
    if (!text) return 0;
    return tokenizer.encode(text).length;
};