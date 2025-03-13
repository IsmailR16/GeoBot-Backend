import OpenAI from 'openai';

import { getCurrentWeather, getLocation, tools } from './tools'

export default {
    async fetch(request, env, ctx) {
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST",
                    "Access-Control-Allow-Headers": "Content-Type"
                }
            });
        }

        if (request.method !== "POST") {
            return new Response("Only POST requests are allowed", { status: 405 });
        }

        const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

		const systemMessages = [
            { 
                role: "system", 
                content: `You are a helpful general assistant with these core capabilities:
        1. Weather Forecasting: Can provide detailed 3-day forecasts only
        2. Location Detection: Can determine user's approximate location
        3. General Knowledge: Answer questions outside weather using your training data
        
        Rules:
        - STRICTLY refuse weather requests beyond 3 days
        - Never claim abilities you don't have
        - Be transparent about limitations
        - Maintain friendly, conversational tone`
            },
            {
                role: "system",
                content: `When handling weather requests:
        - Always mention if you're using detected location
        - Include temperature, conditions, and notable weather alerts
        - Compare to seasonal averages when relevant
        - Suggest appropriate clothing if asked`
            },
            { 
                role: "system", 
                content: `ALWAYS follow this process for activity suggestions:
            1. Automatically detect user location using getLocation
            2. Check current weather with getCurrentWeather
            3. Suggest activities based on both location and weather`}
            
        ];

        try {

            const { query, history = [] } = await request.json();

            // Construct full message list
            const messages = [
                ...systemMessages,
                ...history,
                { role: "user", content: query }
            ];

            // Add truncation logic to prevent context overflow
            const MAX_HISTORY_LENGTH = 20;
            if (messages.length > MAX_HISTORY_LENGTH) {
                messages.splice(
                    systemMessages.length, // Keep system messages
                    messages.length - MAX_HISTORY_LENGTH,
                );
            }

            // Get user's location data from Cloudflare headers
            const userIP = request.headers.get('CF-Connecting-IP');

            // Create location-aware function binding
            const locationAwareGetLocation = (_, env) => getLocation(userIP, env);

            const availableFunctions = {
                getCurrentWeather: (args, env) => getCurrentWeather(args, env),
                getLocation: locationAwareGetLocation
            };

            async function agent(query) {

                const MAX_ITERATIONS = 5;

                for (let i = 0; i < MAX_ITERATIONS; i++) {
                    const response = await openai.chat.completions.create({
                        model: 'gpt-3.5-turbo',
                        messages,
                        tools
                    });

                    const { finish_reason: finishReason, message } = response.choices[0];
                    const { tool_calls: toolCalls } = message;

                    messages.push(message);

                    if (finishReason === "stop") {
                        messages.push({ role: "assistant", content: message.content });
                        return { answer: message.content };
                    } else if (finishReason === "tool_calls") {
                        for (const toolCall of toolCalls) {
                            const functionName = toolCall.function.name;
                            const functionToCall = availableFunctions[functionName];
                            const functionArgs = JSON.parse(toolCall.function.arguments);
                            const functionResponse = await functionToCall(functionArgs, env);
                            messages.push({
                                tool_call_id: toolCall.id,
                                role: "tool",
                                name: functionName,
                                content: functionResponse
                            });
                        }
                    }

                }
            }

            const result = await agent(query);

            return new Response(JSON.stringify({
                answer: result.answer,
                // Return updated history (excluding system messages)
                history: messages
                    .filter(m => m.role !== 'system')
                    .slice(systemMessages.length * -1)
            }), {
                headers: { 
                    "Content-Type": "application/json", 
                    "Access-Control-Allow-Origin": "*" 
                }
            });

        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }
};
