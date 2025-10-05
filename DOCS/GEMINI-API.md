# How to call the Gemini API

This document provides a quick guide on how to call the Gemini API using `curl` with the `gemini-2.5-pro` model and an API key.

## API Key

The API key is stored in the `.env.local` file. **Note:** This key should be kept secret and not be committed to version control.

## Curl Command

Here is an example of how to call the Gemini API with a simple "hello" prompt:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d 
    "{
    "contents": [
      {
        "parts": [
          {
            "text": "hello"
          }
        ]
      }
    ]"
  ```

Replace `YOUR_API_KEY` with the actual API key from the `.env.local` file.

```