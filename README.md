

# AI InterviewBot

AI InterviewBot is a real-time voice-enabled interview practice partner, designed to help you prepare for technical interviews through AI-simulated sessions with detailed audio, video, and transcript analysis.

View your app in AI Studio: https://ai.studio/apps/drive/1jBY8dt4IA2QM-hSHz4KHKGv6PnqD_b7m

## Complete Workflow

1. **Setup Interview**
   - Select target interview role (e.g., Software Engineer).
   - Choose an AI interviewer persona (e.g., Friendly, Stern).
   - Optionally upload your resume in PDF format to tailor the interview context.
   - Toggle on/off body language analysis which uses your webcam for gesture detection.
   - Add any additional context or notes for focused practice.

2. **Starting the Interview**
   - Begin the interview session; a countdown overlay starts for preparation.
   - The AI interviewer begins asking questions using voice synthesis.
   - Your voice is captured and transcribed in real-time.
   - Live audio visualization displays your microphone input amplitude.
   - Webcam captures your body language if enabled and analyzes gestures like smiles and eye contact.

3. **Live Session Interaction**
   - View real-time transcripts of the conversation between you and the AI interviewer.
   - Control the session by ending the interview at any time.

4. **Post-Interview Analysis**
   - Receive a comprehensive feedback report.
   - Scores provided for technical skills, communication clarity, confidence, clarity, and problem-solving.
   - Detailed strengths and improvement areas based on the interview.
   - Gesture metrics summarized from webcam analysis.

5. **Session Reset**
   - Option to reset and start a new interview session.
   - Clears all previous session data and media streams.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
2. Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key.
3. Run the app:

## Project Structure Overview

- `App.tsx`: Main React component controlling the interview flow and state.
- `components/`: Contains UI components including SetupForm, FeedbackReport, AudioVisualizer, and CountdownOverlay.
- `services/`: Helper services for audio capture, gesture detection, and PDF text extraction.
- `metadata.json`: Project metadata and permission requests.
- `index.html`: Entry HTML page with favicon and site title.

