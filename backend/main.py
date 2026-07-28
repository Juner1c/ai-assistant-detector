from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
import os
import requests
from dotenv import load_dotenv

# Load environment variables from .env file if available
load_dotenv()

# Initialize FastAPI app
app = FastAPI()

# Allow origins from environment variable or default to localhost and wildcard for Netlify deployments
cors_origins_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,*").split(",")
cors_origins = [origin.strip() for origin in cors_origins_env if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins, 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Microsoft Presidio for local PII scrubbing
analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

@app.post("/api/scan-image")
async def scan_image(file: UploadFile = File(...)):
    """ Send the image to the Sightengine Cloud Forensic API """
    
    file_bytes = await file.read()
    
    # Sightengine API Keys from environment variables
    API_USER = os.getenv("SIGHTENGINE_API_USER", "")
    API_SECRET = os.getenv("SIGHTENGINE_API_SECRET", "")
    
    try:
        response = requests.post(
            'https://api.sightengine.com/1.0/check.json',
            files={'media': (file.filename, file_bytes, file.content_type)},
            data={
                'models': 'genai',
                'api_user': API_USER,
                'api_secret': API_SECRET
            }
        )
        
        data = response.json()
        
        is_fake = False
        confidence = 0
        flags = []
        model_used = "Real Image / Unknown"
        
        if "type" in data and "ai_generated" in data["type"]:
            confidence = data["type"]["ai_generated"]
            
            if confidence > 0.5:
                is_fake = True
                flags.append("AI generation artifacts detected")
                model_used = "AI Generator (Sightengine)"
            else:
                flags.append("Looks like a real photograph")

        return {
            "is_ai_generated": is_fake,
            "confidence": round(confidence, 2),
            "model_used": model_used,
            "flags": flags
        }
        
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/chat")
async def chat_with_ai(user_message: str = Form(...), is_fake: bool = Form(...)):
    """ Scrub privacy data locally, then talk to the Groq Cloud LLM """
    
    # Step A: Scrub PII with Microsoft Presidio (Keeps sensitive data on your laptop)
    results = analyzer.analyze(text=user_message, language="en")
    anonymized_text = anonymizer.anonymize(text=user_message, analyzer_results=results).text
    
    # Groq API Key from environment variable
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    
    # Step B: Construct the System Prompt
    system_prompt = (
        f"You are a Trust and Safety Assistant protecting users from scams and deepfakes. "
        f"The user uploaded an image. Is it an AI-generated fake? {is_fake}. "
        f"Give the user direct, empathetic advice based on this. Keep it brief. "
        f"IMPORTANT: The user's text has been anonymized for privacy (e.g., <PERSON>, <LOCATION>). "
        f"Talk to them normally, but DO NOT ask them to reveal their real names or locations."
    )
    
    # Step C: Send the Anonymized text to Groq API
    try:
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": anonymized_text}
            ]
        }
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers=headers)
        response_data = response.json()
        
        # Safely extract the AI's response or catch API errors
        if "choices" in response_data and len(response_data["choices"]) > 0:
            ai_reply = response_data["choices"][0]["message"]["content"]
        elif "error" in response_data:
            ai_reply = f"Groq Error: {response_data['error'].get('message', 'Unknown error')}"
        else:
            ai_reply = f"Unexpected response: {response_data}"
        
    except Exception as e:
        ai_reply = f"System Error: Could not connect to AI. {str(e)}"
    
    return {
        "original_message": user_message,
        "scrubbed_message_sent_to_cloud": anonymized_text,
        "ai_response": ai_reply
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)