from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel
from transformers import pipeline
import os
import shutil
import tempfile
import json
import asyncio

app = FastAPI()

# Models directory
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

# Initialize Whisper model with local storage
model_size = "tiny"
try:
    # Try loading locally first
    model = WhisperModel(model_size, device="cpu", compute_type="int8", download_root=MODELS_DIR, local_files_only=True)
except:
    # Download if not found
    print("Downloading Whisper model for the first time...")
    model = WhisperModel(model_size, device="cpu", compute_type="int8", download_root=MODELS_DIR)

# Translation pipeline
translator = None

def get_translator(target_lang="fr"):
    global translator
    model_name = f"Helsinki-NLP/opus-mt-en-{target_lang}"
    model_path = os.path.join(MODELS_DIR, f"translation_{target_lang}")
    
    if translator is None or translator.task != f"translation_en_to_{target_lang}":
        try:
            # Try local load
            translator = pipeline("translation", model=model_path, local_files_only=True)
        except:
            # Download to local path
            print(f"Downloading translation model for {target_lang}...")
            translator = pipeline("translation", model=model_name)
            translator.save_pretrained(model_path)
    return translator

@app.get("/")
async def root():
    return {"message": "AI Video Player Backend"}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), target_lang: str = Body(None)):
    if not file.filename.endswith(('.mp3', '.mp4', '.wav')):
        raise HTTPException(status_code=400, detail="Invalid file type")

    # Save uploaded file to a temporary location
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    async def event_generator():
        try:
            # Transcribe with optimizations: beam_size=1, vad_filter=True
            segments, info = model.transcribe(tmp_path, beam_size=1, vad_filter=True)
            
            # Send initial language info
            yield json.dumps({"language": info.language, "status": "processing"}) + "\n"

            for segment in segments:
                text = segment.text.strip()
                if not text:
                    continue

                translated_text = None
                if target_lang:
                    trans = get_translator(target_lang)
                    if trans:
                        try:
                            translated_text = trans(text)[0]['translation_text']
                        except:
                            translated_text = "[Translation Error]"

                segment_data = {
                    "start": segment.start,
                    "end": segment.end,
                    "text": text,
                    "translation": translated_text
                }
                yield json.dumps(segment_data) + "\n"
                
                # Small sleep to allow frontend to keep up if needed
                await asyncio.sleep(0.01)

            yield json.dumps({"status": "completed"}) + "\n"
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
