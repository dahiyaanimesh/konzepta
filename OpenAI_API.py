from flask import Flask, request, jsonify, make_response
from html.parser import HTMLParser
from flask_cors import CORS
import openai
import os
import re
import html
import base64
from io import BytesIO
import requests
import tempfile
import logging
import traceback
import time
from dotenv import load_dotenv
import json

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('miro_openai_api')

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "https://miro.com", "https://konzepta-9v8j.vercel.app"], supports_credentials=True, methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"])

# --- Config ---
openai.api_key = os.environ.get("OPENAI_API_KEY")
if not openai.api_key:
    logger.error("OPENAI_API_KEY environment variable not set!")
    # In production, use a dummy value to prevent startup failure, but API calls will fail
    if os.environ.get("RENDER"):
        logger.warning("No OpenAI API key provided - API functionality will not work!")
        openai.api_key = "dummy-key-for-startup"

# --- Miro Config ---
MIRO_TOKEN = os.environ.get("MIRO_TOKEN")
if not MIRO_TOKEN:
    logger.error("MIRO_TOKEN environment variable not set!")
    # In production, use a dummy value to prevent startup failure
    if os.environ.get("RENDER"):
        logger.warning("Using dummy MIRO_TOKEN in production - functionality will be limited")
        MIRO_TOKEN = "dummy-token-for-startup"
    
# No longer using a global MIRO_BOARD_ID - we'll get it from each request instead
DEFAULT_BOARD_ID = os.environ.get("MIRO_BOARD_ID", "")
if not DEFAULT_BOARD_ID:
    logger.warning("No default MIRO_BOARD_ID set - this is okay, board ID will be obtained from requests")

# --- API Models config --- 
TEXT_MODEL = os.environ.get("OPENAI_TEXT_MODEL", "gpt-4.1")
IMAGE_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")
IMAGE_SIZE = os.environ.get("OPENAI_IMAGE_SIZE", "1024x1024")
IMAGE_QUALITY = os.environ.get("OPENAI_IMAGE_QUALITY", "low")

# --- Cache config ---
REQUEST_CACHE = {}
CACHE_EXPIRY = 300  # 5 minutes

# --- HTML stripping utility ---
class HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []

    def handle_data(self, data):
        self.text.append(data)

    def get_data(self):
        return ''.join(self.text)

def strip_html(html_content):
    if not html_content:
        return ""
    stripper = HTMLStripper()
    stripper.feed(html_content)
    return stripper.get_data()

def clean_html(raw_html):
    if not raw_html:
        return ""
    return re.sub(r"<.*?>", "", raw_html).strip()

# --- OpenAI Client ---
def get_openai_client():
    try:
        from openai import OpenAI
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.error("OPENAI_API_KEY environment variable not set or empty!")
            # Provide a fallback for development purposes only
            #api_key = ""
            logger.warning("Using fallback API key - not recommended for production")
        
        return OpenAI(api_key=api_key)
    except ImportError:
        logger.error("Failed to import OpenAI. Make sure the package is installed.")
        raise

# --- Caching Utilities ---
def get_cache_key(endpoint, params):
    """Create a cache key from endpoint and parameters"""
    return f"{endpoint}:{hash(frozenset(params.items() if isinstance(params, dict) else params))}"

def get_from_cache(endpoint, params):
    """Get cached response if available and not expired"""
    key = get_cache_key(endpoint, params)
    cached = REQUEST_CACHE.get(key)
    if cached:
        timestamp, value = cached
        if time.time() - timestamp < CACHE_EXPIRY:
            logger.info(f"Cache hit for {endpoint}")
            return value
    return None

def save_to_cache(endpoint, params, value):
    """Save response to cache"""
    key = get_cache_key(endpoint, params)
    REQUEST_CACHE[key] = (time.time(), value)

# --- Error Handling ---
@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Unhandled exception: {str(e)}")
    logger.error(traceback.format_exc())
    return jsonify({"error": "Internal server error", "details": str(e)}), 500

# --- Routes ---
@app.route('/', methods=['GET'])
def root():
    """Root endpoint that simply returns a status message"""
    return jsonify({
        "status": "ok",
        "name": "AI Ideation Assistant API",
        "version": "1.0.0",
        "endpoints": [
            "/health",
            "/generate-ideas",
            "/generate-image-ideas",
            "/generate-text2image-sketches"
        ]
    })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "timestamp": time.time(),
        "service": "miro-openai-api"
    })

@app.route('/generate-ideas', methods=['POST'])
def generate_ideas():
    """Generate text ideas based on sticky note content"""
    start_time = time.time()
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        content = data.get("content", "").strip()
        custom_prompt = data.get("prompt", "").strip()
        board_id = data.get("boardId", DEFAULT_BOARD_ID)

        if not content:
            return jsonify({"error": "No sticky note content provided"}), 400
            
        # We don't strictly require board_id for text generation, but we'll log it
        if board_id:
            logger.info(f"Processing text generation for board: {board_id}")

        # Check cache
        cache_params = {"content": content, "prompt": custom_prompt}
        cached_response = get_from_cache("generate-ideas", cache_params)
        if cached_response:
            return jsonify(cached_response)

        clean_text = strip_html(content)

        base_prompt = f"""
       
            You are a professional AI ideation assistant supporting UX designers and clients in a live ideation workshop on a Miro board. Your role is to help the team stay in a generative, exploratory phase—not to propose solutions.
 
            Based on the sticky note below, suggest 3 new sticky notes that each:
 
            - Reframe or expand the original thought to open new directions.
 
            - Use different thinking lenses, including but not limited to: technical, sustainability, data-driven, time-sensitive, accessibility, risk-aware, regulatory, scalability, financial, commercial, user-centric, innovative, and visionary, to explore diverse perspectives.
 
            - Pose a question, challenge an assumption, or introduce a fresh lens—not a defined concept.
 
            Avoid naming tools, services, features, or systems. Do not propose fully-formed solutions. Focus on sparking curiosity, discussion, and creative momentum. Use clear, simple language understandable to both designers and clients. Limit each sticky note to 10 words or fewer.
           
            Sticky Note: "{clean_text}"
             
            Format your response like this (no markdown, asterisks, or hashes):
             
            Idea 1: 10 words max provoking further exploration or variation of the idea.
             
            Idea 2: ...
             
            Idea 3: ...
           
            """.strip()
            
        if custom_prompt:
            prompt = f"""
            Respond to the sticky note and context below.
            
            Respond with:
            - Exactly three distinct ideas.
            - Each idea must be a single sentence.
            - Each sentence must begin with: Idea 1:, Idea 2:, and Idea 3: respectively.
            - Do NOT add any explanation, follow-up, or extra content.
            - Do NOT use markdown, bullets, or multiple lines.
            - Your response MUST be exactly three sentences and nothing more.
            
            Sticky Note: "{clean_text}"
            Context: "{custom_prompt}"
            """.strip()
        
        else:
            prompt = base_prompt

        logger.info(f"Text Generation - Prompt (length: {len(prompt)})")

        try:
            client = get_openai_client()

            response = client.chat.completions.create(
                model=TEXT_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.9,
                max_tokens=500
            )

            suggestions = response.choices[0].message.content
            logger.info(f"AI response received (length: {len(suggestions)})")

            result = {"suggestions": suggestions}
            
            # Cache the result
            save_to_cache("generate-ideas", cache_params, result)
            
            # Add timing info
            processing_time = time.time() - start_time
            logger.info(f"Text generation completed in {processing_time:.2f}s")
            
            return jsonify(result)

        except Exception as e:
            logger.error(f"OpenAI API Error: {str(e)}")
            return jsonify({"error": "OpenAI API error", "details": str(e)}), 500

    except Exception as e:
        logger.error(f"Generate ideas error: {str(e)}")
        return jsonify({"error": "Failed to process request", "details": str(e)}), 500

@app.route('/generate-text2image-sketches', methods=['POST', 'OPTIONS'])
def generate_text2image_sketches():
    """Generate images based on selected sticky notes or shapes using OpenAI DALL-E"""
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response

    start_time = time.time()
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
            
        selected_shape_ids = data.get("selectedShapeIds", [])
        content = data.get("content", "")
        # Use board ID from request if provided, otherwise fall back to env variable
        board_id = data.get("boardId", DEFAULT_BOARD_ID)
        
        if not board_id:
            return jsonify({"error": "No board ID provided in request. Please specify 'boardId' parameter."}), 400
            
        logger.info(f"Using board ID: {board_id}")
        
        # Get position and geometry data from the frontend
        position_data = data.get("positionData")
        geometry_data = data.get("geometryData")
        if position_data:
            logger.info(f"Using position data from frontend: {position_data}")
        if geometry_data:
            logger.info(f"Using geometry data from frontend: {geometry_data}")
        
        logger.info(f"Image Generation - Processing request - IDs: {len(selected_shape_ids)}, Content: {bool(content)}")
        
        # Check cache 
        cache_params = {"content": content, "ids": ",".join(selected_shape_ids)}
        cached_response = get_from_cache("generate-text2image-sketches", cache_params)
        if cached_response:
            return jsonify(cached_response)
        
        # Method 1: If content is directly provided in the request
        if content:
            logger.info("Using provided content directly")
            shape_items = [{
                "id": "direct_content",
                "text": content.strip()
            }]
        # Method 2: If shape IDs are provided, fetch from Miro
        elif selected_shape_ids:
            logger.info(f"Using selected shape IDs: {selected_shape_ids}")
            headers = {
                "Authorization": f"Bearer {MIRO_TOKEN}",
                "accept": "application/json"
            }
            response = requests.get(
                f"https://api.miro.com/v2/boards/{board_id}/items", 
                headers=headers,
                timeout=10
            )
            if response.status_code != 200:
                return jsonify({"error": f"Failed to fetch Miro items: {response.status_code}"}), 500

            shape_items = []
            for item in response.json().get("data", []):
                if item.get("type") in ["shape", "sticky_note", "text"] and item.get("id") in selected_shape_ids:
                    raw_text = item.get("data", {}).get("content", "")
                    raw_text = clean_html(raw_text)
                    raw_text = html.unescape(raw_text)

                    shape_items.append({
                        "id": item.get("id", "unknown"),
                        "text": raw_text.strip(),
                    })
        else:
            return jsonify({"error": "No content or shape IDs provided"}), 400

        if not shape_items or all(not item.get("text") for item in shape_items):
            return jsonify({"status": "no_valid_shapes_found"}), 200
            
        client = get_openai_client()
        generated_images = []

        for shape in shape_items:
            raw_text = shape.get("text", "").strip()
            if not raw_text:
                continue

            # Create prompt for DALL-E
            full_prompt = (
                    f"An image illustrating the core ideas of a UX brainstorming session. "
                    f"Theme: '{raw_text}'. "
                    f"Create a clean, high-quality, professional image that visually represents the theme. "
                    f"Can include people, objects, or environments. Use simple, clear composition with a modern aesthetic. "
                    f"Minimal visual clutter. No text. Neutral or soft background. "
                    f"Design should support UX ideation by conveying the concept in an intuitive and visually engaging way."
            )
            logger.info(f"Generating image for: {raw_text[:50]}...")

            try:
                # Use model to generate image
                image_params = {
                    "model": IMAGE_MODEL,
                    "prompt": full_prompt,
                    "size": IMAGE_SIZE,
                    "n": 1
                }
                
                # Add quality parameter if using compatible model
                if IMAGE_MODEL == "dall-e-3":
                    image_params["quality"] = IMAGE_QUALITY
                
                response = client.images.generate(**image_params)
                
                # Get the image URL
                image_url = response.data[0].url
                
                # Download the image
                image_response = requests.get(image_url, timeout=10)
                if image_response.status_code == 200:
                    # Convert to base64
                    img_base64 = base64.b64encode(image_response.content).decode("utf-8")
                    
                    generated_images.append({
                        "id": shape["id"],
                        "prompt": raw_text,
                        "base64_image": img_base64
                    })
                    logger.info(f"Successfully generated image for {shape['id']}")
                else:
                    logger.error(f"Failed to download image: {image_response.status_code}")

            except Exception as e:
                logger.error(f"Error generating image for {shape['id']}: {str(e)}")

        result = {
            "status": "success",
            "count": len(generated_images),
            "images": generated_images
        }
        
        # Cache the result
        if generated_images:
            save_to_cache("generate-text2image-sketches", cache_params, result)
            
        # Add timing info
        processing_time = time.time() - start_time
        logger.info(f"Image generation completed in {processing_time:.2f}s")
        
        return jsonify(result)

    except Exception as e:
        logger.error(f"Image generation error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Server error", "details": str(e)}), 500

@app.route('/generate-image-ideas', methods=['POST'])
def generate_image_ideas():
    """Generate 3 image ideas for each prompt (free text or selected shapes)
       and post them side‑by‑side on the board."""
    t0 = time.time()

    try:
        # -------- request & sanity checks --------
        data      = request.get_json(force=True) or {}
        sel_ids   = data.get("selectedShapeIds", [])
        free_txt  = (data.get("content") or "").strip()
        board_id  = data.get("boardId") or DEFAULT_BOARD_ID
        if not board_id:
            return jsonify(error="No board ID provided"), 400
        if not sel_ids and not free_txt:
            return jsonify(error="No content or shape IDs provided"), 400

        # -------- placement & geometry --------
        pos = data.get("positionData") or {
            "x": 0, "y": 0, "origin": "center", "relativeTo": "canvas_center"
        }
        geo = data.get("geometryData") or {"width": 600, "height": 600}
        geo.setdefault("height", geo["width"])          # keeping it square.
        offset = geo["width"] + 50                      # maintaining a gap between images.

        # -------- gather prompt strings --------
        prompts      = []
        miro_headers = {"Authorization": f"Bearer {MIRO_TOKEN}",
                        "accept": "application/json"}

        def clean(text: str) -> str:
            return html.unescape(clean_html(text or "")).strip()

        # 1. selected shapes
        for _id in sel_ids:
            try:
                r = requests.get(f"https://api.miro.com/v2/boards/{board_id}/items/{_id}",
                                headers=miro_headers, timeout=8)
                if r.status_code != 200:
                    logger.warning("Couldn't fetch %s (%s)", _id, r.status_code)
                    continue
                item = r.json()
                if item.get("type") not in {"sticky_note", "shape", "text"}:
                    continue
                # try a few fields in order
                candidates = [
                    item.get("data", {}).get("content"),
                    item.get("data", {}).get("plainText"),
                    item.get("text"),
                    item.get("title")
                ]
                extracted = next((clean(c) for c in candidates if clean(c)), "")
                if extracted:
                    prompts.append(extracted)
            except requests.exceptions.RequestException as e:
                logger.warning(f"Error fetching Miro item {_id}: {str(e)}")
                continue

        # 2. free‑form text from request body.
        if free_txt:
            prompts.append(free_txt)

        if not prompts:
            return jsonify(status="no_valid_shapes_found"), 200

        # -------- generate & upload --------
        client       = get_openai_client()
        images_added = 0

        for prompt in prompts:
            try:
                full_prompt = (
                    f"Create a clean, high-quality image that visually represents this theme: '{prompt}'. "
                    f"Depict a realistic scene or metaphor involving people, environments, or objects. "
                    f"The image should have a modern, simple aesthetic with minimal visual clutter. "
                    f"There should be absolutely no text, labels, signs, symbols, characters, or written language in the image. "
                    f"Do not include UI elements, instructions, buttons, or any form of on-screen text. "
                    f"The image should have one clear subject and a neutral or soft background."
                )


                # Generate just one image
                logger.info(f"Generating image for prompt: {prompt[:30]}...")
                
                # Use the standard size since smaller sizes aren't supported
                # According to API error, supported values are: '1024x1024', '1024x1536', '1536x1024', and 'auto'
                
                # Request a single image
                rsp = client.images.generate(
                    model = IMAGE_MODEL,
                    prompt = full_prompt,
                    size = "1024x1024",  # Using standard size as smaller isn't supported
                    n = 1,
                    **({"quality": IMAGE_QUALITY} if IMAGE_MODEL == "dall-e-3" else {})
                )
                
                img = rsp.data[0]
                
                # ---- decode regardless of response format ----
                img_bytes = None
                if getattr(img, "b64_json", None):
                    img_bytes = base64.b64decode(img.b64_json)
                elif getattr(img, "url", None):
                    dl = requests.get(img.url, timeout=10)
                    if dl.status_code != 200:
                        logger.warning("Couldn't download image: %s", dl.status_code)
                        continue
                    img_bytes = dl.content
                else:
                    logger.warning("No image payload returned for prompt %s", prompt[:30])
                    continue
                
                # ---- temporary file for upload ----
                with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tf:
                    tf.write(img_bytes)
                    tmp_path = tf.name

                # Use center position instead of offset 
                cur_pos = pos

                # Add retry logic for upload
                max_retries = 3
                retry_delay = 2  # seconds
                upload_success = False
                
                for retry in range(max_retries):
                    try:
                        with open(tmp_path, "rb") as fh:
                            up = requests.post(
                                f"https://api.miro.com/v2/boards/{board_id}/images",
                                headers=miro_headers,
                                files={'resource': ('image.png', fh, 'image/png')},
                                data={
                                    "position": json.dumps(cur_pos),
                                    "geometry": json.dumps(geo),
                                    "data": json.dumps({"title": f"{prompt[:40]} – idea"})
                                },
                                timeout=30
                            )
                        
                        if up.status_code in (200, 201, 202):
                            images_added += 1
                            upload_success = True
                            break
                        else:
                            logger.warning(f"Upload attempt {retry+1}/{max_retries} failed with status {up.status_code}: {up.text}")
                            time.sleep(retry_delay)
                    except requests.exceptions.RequestException as e:
                        logger.warning(f"Upload attempt {retry+1}/{max_retries} failed with error: {str(e)}")
                        time.sleep(retry_delay)
                
                # Always clean up the temporary file
                try:
                    os.unlink(tmp_path)
                except (OSError, IOError) as e:
                    logger.warning(f"Failed to remove temporary file {tmp_path}: {str(e)}")
                
                if not upload_success:
                    logger.error(f"Failed to upload image after {max_retries} attempts")
            except Exception as e:
                logger.error(f"Error generating image for prompt '{prompt[:30]}': {str(e)}")
                continue

        return jsonify(
            status="success",
            images_added=images_added,
            processing_time_seconds=round(time.time() - t0, 2)
        )

    except Exception as e:
        logger.exception("generate-image-ideas failed")
        return jsonify(error=str(e), status="error"), 500


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5050))
    logger.info(f"Starting Miro OpenAI API Server on port {port}")
    logger.info(f"Text model: {TEXT_MODEL}, Image model: {IMAGE_MODEL}")
    logger.info(f"CORS origins: {app.config['CORS_ORIGINS'] if 'CORS_ORIGINS' in app.config else 'Default'}")
    app.run(debug=True, port=port, host='0.0.0.0')
