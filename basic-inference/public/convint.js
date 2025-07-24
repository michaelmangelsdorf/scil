/**
 * Convint - Conventional (Non-AI) Interface Hooks
 * This file acts as a dispatcher for various conventional logic services.
 * It should not contain any AI inference calls.
 */

/**
 * Called at the start of a turn. Dispatches to the appropriate service based on service_id.
 * @param {string} service_id - The ID of the service to run (e.g., 'pacing').
 * @param {object} payload - The data for the upcoming inference.
 * @param {object} currentState - The relevant current state object from the frontend.
 * @returns {Promise<object>} - The potentially modified payload.
 */
export const onPlayStart = async (service_id, payload, currentState) => {
    console.log(`[ConvInt Hook] onPlayStart triggered for service: '${service_id}'`);

    switch (service_id) {
        case 'pacing': {
            const currentPacingState = currentState;
            console.log('[ConvInt] Pacing service: Current state:', currentPacingState);

            // This hook determines a "pacing key" for the backend to use.
            const lengthRatio = currentPacingState.lastAgentResponseLength / (currentPacingState.lastUserQueryLength || 1);

            if (currentPacingState.lastAgentResponseLength > 450 || lengthRatio > 5) {
                payload.pacingKey = 'BE_BRIEF_HARD';
            } else if (currentPacingState.lastUserQueryLength < 60 && currentPacingState.lastAgentResponseLength > 200) {
                payload.pacingKey = 'MATCH_BREVITY';
            }
            
            return payload;
        }

        // You can add future services here, for example:
        // case 'tool_check': {
        //   console.log('[ConvInt] Tool Check service running...');
        //   // logic for checking for tool use syntax
        //   return payload;
        // }

        default:
            console.log(`[ConvInt Hook] No onPlayStart logic for service: '${service_id}'`);
            return payload; // Always return the payload
    }
};

/**
 * Called at the end of a turn. Dispatches to the appropriate service.
 * @param {string} service_id - The ID of the service to run (e.g., 'pacing').
 * @param {string} finalResponse - The complete text response from the agent.
 * @param {object} originalPayload - The initial payload from onPlayStart.
 * @returns {Promise<object|null>} - A new state object to be stored, or null if no state update is needed.
 */
export const onPlayEnd = async (service_id, finalResponse, originalPayload) => {
    console.log(`[ConvInt Hook] onPlayEnd triggered for service: '${service_id}'`);

    switch (service_id) {
        case 'pacing': {
            console.log('[ConvInt] Pacing service: Calculating new state.');
            const newPacingState = {
                lastUserQueryLength: originalPayload.user_query.length,
                lastAgentResponseLength: finalResponse.length
            };
            return newPacingState;
        }

        default:
            console.log(`[ConvInt Hook] No onPlayEnd logic for service: '${service_id}'`);
            return null; // Return null if this service doesn't update state
    }
};