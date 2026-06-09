Please help me debug and fix an issue with the iFlytek (科大讯飞) Speech Evaluation API integration in my Next.js project.

【Current Issue】
Frontend recording and local playback work perfectly. However, when the audio is sent to the backend, the iFlytek API consistently responds with "incomplete sentence" (没有念完整的句子) or gives an extremely low score. Furthermore, it fails to return the recognized text, which breaks the downstream DeepSeek NPC dialogue flow.

【Tasks to Execute】
Please search the codebase for the audio recording hook/component and the iFlytek API route, then implement the following two fixes:

1. Fix Audio Format Resampling (Frontend)
iFlytek strictly requires 16kHz, 16-bit, Mono PCM or WAV format. Browsers record in WebM/Ogg by default.
- Find the frontend recording logic (likely using `MediaRecorder`).
- Implement the Web Audio API (`AudioContext`) to decode the recorded audio blob and resample it to exactly 16kHz, 16-bit, Mono PCM format before sending it to the backend.

2. Fix Reference Text and STT Fallback (Backend & Parsing)
The iFlytek ISE (Speech Evaluation) API fails if the spoken audio drastically differs from the reference text, or if no text is provided.
- Locate the API route handling the iFlytek WebSocket connection (e.g., `/api/evaluate-speech`).
- Ensure the frontend correctly passes a `text` parameter (the expected sentence).
- Modify the XML/JSON parsing logic for the iFlytek response: Even if the API returns a low score or a warning about an "incomplete sentence", aggressively extract whatever actual English words were recognized (usually found in the `content` or `recognizedText` fields of the XML payload). 
- Ensure this extracted text is returned to the frontend so that the DeepSeek API can still be triggered for a response.

Please explore the relevant files, apply the necessary code modifications, and explain the changes you made.