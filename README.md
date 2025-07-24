
Node web application for playing around with scene/dialog based LLM chats and multi-stage inference.

The app has an abstraction layer to be able to work with either GGUF files directly, using node-llama-cpp, or using LM Studio as a model server.

But I couldn't get the chat template to work with roles, so by default, the app expects LM Studio to be running locally.
Since LM Studio has an OpenAI compatible API, it should work with GPT as well.

The API endpoints and model preferences can be set in the .env file.

![Source](https://github.com/michaelmangelsdorf/scil/blob/main/scil.png)
