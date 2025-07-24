// vector-expert/public/dom-elements.js

// --- DOM Element References ---
// Model selection elements
export const modelSelectionHeader = document.getElementById('model-selection-header'); // NEW
export const modelCollapsibleContent = document.querySelector('#model-selection-header + .collapsible-content'); // NEW

export const inferenceModelPickerGroup = document.getElementById('inference-model-picker-group');
export const inferenceModelSelect = document.getElementById('inference-model-select');
export const refreshInferenceModelsBtn = document.getElementById('refresh-inference-models-btn'); // NEW ID
export const inferenceModelStatus = document.getElementById('inference-model-status');
export const selectedInferenceModelContextLength = document.getElementById('selected-inference-model-context-length');
export const inferenceModelPreferredDisplay = document.getElementById('inference-model-preferred-display');

export const embeddingModelPickerGroup = document.getElementById('embedding-model-picker-group');
export const embeddingModelSelect = document.getElementById('embedding-model-select');
export const refreshEmbeddingModelsBtn = document.getElementById('refresh-embedding-models-btn'); // NEW ID
export const embeddingModelStatus = document.getElementById('embedding-model-status');
export const selectedEmbeddingModelContextLength = document.getElementById('selected-embedding-model-context-length');
export const embeddingModelPreferredDisplay = document.getElementById('embedding-model-preferred-display');


export const sceneSelect = document.getElementById('scene-select');
export const agentSelect = document.getElementById('agent-select'); // For Memory/Vector Embeddings
export const playwrightAgentSelect = document.getElementById('playwright-agent-select'); // For Playwright Inference

export const contentTextbox = document.getElementById('content-textbox');
export const storeEmbeddingBtn = document.getElementById('store-embedding-btn');
export const queryEmbeddingsBtn = document.getElementById('query-embeddings-btn');
export const teachDialogsBtn = document.getElementById('teach-dialogs-btn');
export const playwrightQueryBtn = document.getElementById('playwright-query-btn'); // New button
export const queryResultsTextbox = document.getElementById('query-results-textbox');

// --- Global State Variables ---
export let availableModels = []; // Stores ALL available models from LM Studio

export let availableScenes = [];
export let availableAgents = []; // All agents
export let availablePlaywrightAgents = []; // Only Playwright agents

export let selectedInferenceModelId = null; // Renamed from selectedModelId
export let selectedEmbeddingModelId = null; // NEW
export let selectedSceneId = null;
export let selectedAgentId = null; // For Memory/Vector Embeddings
export let selectedPlaywrightAgentId = null; // For Playwright Inference

// Functions to update mutable exported state variables
export const setAvailableModels = (models) => { availableModels = models; };
export const setAvailableScenes = (scenes) => { availableScenes = scenes; };
export const setAvailableAgents = (agents) => { availableAgents = agents; };
export const setAvailablePlaywrightAgents = (agents) => { availablePlaywrightAgents = agents; };

export const setSelectedInferenceModelId = (id) => { selectedInferenceModelId = id; }; // Renamed
export const setSelectedEmbeddingModelId = (id) => { selectedEmbeddingModelId = id; }; // NEW
export const setSelectedSceneId = (id) => { selectedSceneId = id; };
export const setSelectedAgentId = (id) => { selectedAgentId = id; };
export const setSelectedPlaywrightAgentId = (id) => { selectedPlaywrightAgentId = id; };
