// basic-inference/public/dom-elements.js
// scil/basic-inference/public/dom-elements.js

// Model selection elements
export const inferenceModelPickerGroup = document.getElementById('inference-model-picker-group');
export const inferenceModelSelect = document.getElementById('inference-model-select');
export const inferenceModelPreferredDisplay = document.getElementById('inference-model-preferred-display');
export const inferenceModelStatus = document.getElementById('inference-model-status');
export const selectedInferenceModelContextLength = document.getElementById('selected-inference-model-context-length');

export const embeddingModelPickerGroup = document.getElementById('embedding-model-picker-group');
export const embeddingModelSelect = document.getElementById('embedding-model-select');
export const embeddingModelPreferredDisplay = document.getElementById('embedding-model-preferred-display');
export const embeddingModelStatus = document.getElementById('embedding-model-status');
export const selectedEmbeddingModelContextLength = document.getElementById('selected-embedding-model-context-length');


export const refreshInferenceModelsBtn = document.getElementById('refresh-models-btn'); // Renamed from refreshModelsBtn
export const refreshEmbeddingModelsBtn = document.getElementById('refresh-embedding-models-btn'); // NEW


// Scene selection elements
export const sceneListbox = document.getElementById('scene-listbox');
export const sceneCanonSynopsisDisplay = document.getElementById('scene-canon-synopsis');
export const selectedSceneNameDisplay = document.getElementById('selected-scene-name-display'); // NEW: Export the span for scene name

// Dialog interaction elements
export const aiPersonaField = document.getElementById('ai-persona-field'); // Now a select element
export const userAgentField = document.getElementById('user-agent-field'); // Now a select element
export const userQueryTextbox = document.getElementById('user-query-textbox');
export const aiResponseTextbox = document.getElementById('ai-response-textbox');
export const responseSpinner = document.getElementById('response-spinner');
export const commentTextbox = document.getElementById('comment-textbox');
export const revisedTextarea = document.getElementById('revised-textarea');
export const exemplaryCheckbox = document.getElementById('exemplary-checkbox');

// Inference Buttons
export const autoBtn = document.getElementById('auto-btn');
export const playBtn = document.getElementById('play-btn');
export const refineCheckbox = document.getElementById('refine-checkbox');
export const thinkBtn = document.getElementById('think-btn');
export const planBtn = document.getElementById('plan-btn');
export const wonderBtn = document.getElementById('wonder-btn');
export const evolveBtn = document.getElementById('evolve-btn'); // NEW

// Dialog control buttons
export const saveDialogBtn = document.getElementById('save-dialog-btn');
export const insertDialogBtn = document.getElementById('insert-dialog-btn');
export const clearTextFieldsBtn = document.getElementById('clear-text-fields-btn');
export const vocabBtn = document.getElementById('vocab-btn'); // NEW: Export for the vocab button
export const keyboardBtn = document.getElementById('keyboard-btn'); // NEW: Export for the keyboard button
export const deleteDialogBtn = document.getElementById('delete-dialog-btn');

// Dialog navigation buttons
export const dialogPrevBtn = document.getElementById('dialog-prev-btn');
export const dialogNextBtn = document.getElementById('dialog-next-btn');
export const dialogSortOrderDisplay = document.getElementById('dialog-sort-order-display'); // NEW: Export the sort order display

// Reload current dialog button
export const reloadCurrentDialogBtn = document.getElementById('reload-current-dialog-btn');

// Korean Keyboard Modal Elements (NEW)
export const koreanKeyboardModal = document.getElementById('koreanKeyboardModal');
export const koreanKeyboardInput = document.getElementById('koreanKeyboardInput');
export const koreanKeyboardCancelBtn = document.getElementById('koreanKeyboardCancelBtn');
export const koreanKeyboardDoneBtn = document.getElementById('koreanKeyboardDoneBtn');
export const keyboardContainer = document.getElementById('keyboardContainer');


// Centralized state object. All parts of the app will import this
// and read/write to its properties, ensuring everyone has the latest data.
export const AppState = {
    selectedSceneId: null,
    selectedInferenceModelId: null,
    selectedInferenceModelContextLength: null,
    selectedEmbeddingModelId: null,
    selectedEmbeddingModelContextLength: null,
    currentSceneDialogs: [], // Array to hold all dialogs for the current scene
    currentDialogIndex: -1, // Index of the currently displayed dialog in currentSceneDialogs
    isLmStudio: null, // Will be true or false after initialization
    
    // New state for agent/user pickers
    availablePersonAgents: [], // Stores all agents of type 'Person'
    selectedUserAgentName: null, // Stores the name of the selected user agent
    selectedAiPersonaName: null, // Stores the name of the selected AI persona

    // Add sub-object for pacing state
    pacingState: {
        lastUserQueryLength: 0,
        lastAgentResponseLength: 0,
    }
};

// Initial state for agent details (can stay as is)
export let currentAgentDetails = null;
export const setCurrentAgentDetails = (details) => {
    currentAgentDetails = details;
};

// Initial state for user agent details (can stay as is)
export let currentUserAgentDetails = null;
export const setCurrentUserAgentDetails = (details) => {
    currentUserAgentDetails = details;
};
