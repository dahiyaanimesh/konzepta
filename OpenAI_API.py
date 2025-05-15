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
TEXT_MODEL = os.environ.get("OPENAI_TEXT_MODEL", "gpt-4.1-nano")
IMAGE_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")
IMAGE_SIZE = os.environ.get("OPENAI_IMAGE_SIZE", "1024x1024")
IMAGE_QUALITY = os.environ.get("OPENAI_IMAGE_QUALITY", "high")

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

        if custom_prompt:
            prompt = f"{custom_prompt}\n\nSticky Note: \"{clean_text}\""
        else:
            prompt = f"""
You are an AI collaborator supporting UX designers and clients in a live ideation workshop. Your goal is to help the group keep exploring ideas—diverging, remixing, and questioning—not to finalize solutions.

Based on the sticky note below, suggest **3 new sticky notes** that each:

- Build on or reframe the current idea.
- Spark new directions or tensions.
- Use different thinking lenses (e.g., emotional, technical, absurd, inclusive, playful).

Avoid fully-formed solutions. Focus on energizing the brainstorm with creative momentum. Use no more than **10 words** per sticky note.

Sticky Note: "{clean_text}"

Format your response like this (no markdown, asterisks, or hashes):

Concept 1: Title of the Idea

- Concept: 10 words max provoking further exploration or variation of the idea.

Concept 2: ...

Concept 3: ...
""".strip()

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
                    f"Theme: '{prompt}'. "
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
    """Generate and directly add images to Miro board using OpenAI DALL-E"""
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
            return jsonify({"error": "No board ID provided or configured"}), 400
            
        logger.info(f"Using board ID: {board_id}")
        
        # Get position data directly from the frontend if available
        position_data = None
        if "positionData" in data and data["positionData"]:
            position_data = data["positionData"]
            logger.info(f"Received position data from frontend: {position_data}")
            
            # Make sure the position data contains the required fields
            if not all(k in position_data for k in ["x", "y"]):
                logger.warning(f"Invalid position data received: {position_data}")
                position_data = None
        
        # Use default position if not provided or invalid
        if not position_data:
            position_data = {
                "x": 0,
                "y": 0,
                "origin": "center",
                "relativeTo": "canvas_center"
            }
            logger.warning(f"Using default position data: {position_data}")
        
        # Get geometry data from the frontend if available
        geometry = None
        if "geometryData" in data and data["geometryData"]:
            geometry = data["geometryData"]
            logger.info(f"Received geometry data from frontend: {geometry}")
            
        # Use default geometry if not provided
        if not geometry:
            geometry = {
                "width": 600,
                "height": 600
            }
            logger.info(f"Using default geometry: {geometry}")
        elif "width" in geometry and "height" not in geometry:
            # If only width is provided, make it square
            geometry["height"] = geometry["width"]
            
        # Ensure position_data has correct format for Miro API
        if "origin" not in position_data:
            position_data["origin"] = "center"
            
        logger.info(f"Final position data to be used: {position_data}")
        logger.info(f"Final geometry data to be used: {geometry}")
        
        # Initialize counter
        images_added = 0
        client = get_openai_client()
        
        # Method 1: If content is directly provided in the request
        if content:
            logger.info("Using provided content directly")
            
            # Generate image prompt from the content
            prompt = content.strip()
            if not prompt:
                return jsonify({"error": "Empty content provided"}), 400
                
            # Create prompt for DALL-E
            full_prompt = (
                    f"An image illustrating the core ideas of a UX brainstorming session. "
                    f"Theme: '{prompt}'. "
                    f"Create a clean, high-quality, professional image that visually represents the theme. "
                    f"Can include people, objects, or environments. Use simple, clear composition with a modern aesthetic. "
                    f"Minimal visual clutter. No text. Neutral or soft background. "
                    f"Design should support UX ideation by conveying the concept in an intuitive and visually engaging way."
            )
            
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
                    # Save to temporary file
                    temp_file = None
                    try:
                        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                        temp_file.write(image_response.content)
                        temp_file.close()
                        temp_file_path = temp_file.name
                        
                        # Open the file and prepare for upload
                        with open(temp_file_path, 'rb') as image_file:
                            files = {
                                'resource': ('image.png', image_file, 'image/png')
                            }
                            
                            headers = {
                                "Authorization": f"Bearer {MIRO_TOKEN}",
                                "accept": "application/json"
                            }
                            
                            # Use position to the right of selected items
                            post_data = {}
                            
                            # Need to stringify the position and geometry data for Miro API
                            miro_data = {
                                "data": {
                                    "title": prompt[:50] if len(prompt) > 50 else prompt
                                }
                            }
                            
                            # Add position data to the payload
                            logger.info(f"Adding position data to request: {position_data}")
                            
                            # Post the image to Miro
                            logger.info(f"Posting image to Miro board {board_id} with position: {position_data}")
                            
                            post_resp = requests.post(
                                f"https://api.miro.com/v2/boards/{board_id}/images",
                                headers=headers,
                                files=files,
                                data={
                                    "position": json.dumps(position_data),
                                    "geometry": json.dumps(geometry),
                                    "data": json.dumps({"title": prompt[:50] if len(prompt) > 50 else prompt})
                                },
                                timeout=10
                            )
                            
                            if post_resp.status_code in [200, 201, 202]:
                                response_data = post_resp.json()
                                logger.info(f"Image posted to Miro board - Response: {response_data}")
                                if 'id' in response_data:
                                    logger.info(f"Image ID on Miro board: {response_data['id']}")
                                images_added += 1
                            else:
                                logger.warning(f"Failed to post image to Miro. Status: {post_resp.status_code}. Response: {post_resp.text}")
                    finally:
                        # Clean up temporary file
                        if temp_file and os.path.exists(temp_file.name):
                            os.unlink(temp_file.name)
            except Exception as e:
                logger.error(f"Error generating/uploading image: {str(e)}")
            
        # Method 2: Using selected shapes from Miro
        elif selected_shape_ids:
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
                    
                    if raw_text.strip():
                        shape_items.append({
                            "id": item.get("id", "unknown"),
                            "text": raw_text.strip()
                        })
                    
            if not shape_items:
                return jsonify({"status": "no_valid_shapes_found"}), 200
                
            for shape in shape_items:
                raw_text = shape.get("text", "").strip()
                
                # Create prompt for DALL-E
                full_prompt = (
                    f"An abstract concept sketch in a UX brainstorming session. "
                    f"Theme: '{raw_text}'. Simple, clean, professional digital sketch with BRIGHT BOLD COLORS on pure white background. "
                    f"Very high contrast. Minimal design. No text. Use simple lines and shapes with bright primary colors."
                )
                
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
                        # Save to temporary file
                        temp_file = None
                        try:
                            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                            temp_file.write(image_response.content)
                            temp_file.close()
                            temp_file_path = temp_file.name
                            
                            # Open the file and prepare for upload
                            with open(temp_file_path, 'rb') as image_file:
                                files = {
                                    'resource': ('image.png', image_file, 'image/png')
                                }
                                
                                headers = {
                                    "Authorization": f"Bearer {MIRO_TOKEN}",
                                    "accept": "application/json"
                                }
                                
                                # Post the image to Miro
                                logger.info(f"Posting image to Miro board {board_id} with position: {position_data}")
                                
                                # Post to Miro with the correct JSON format
                                post_resp = requests.post(
                                    f"https://api.miro.com/v2/boards/{board_id}/images",
                                    headers=headers,
                                    files=files,
                                    data={
                                        "position": json.dumps(position_data),
                                        "geometry": json.dumps(geometry),
                                        "data": json.dumps({"title": raw_text[:50] if len(raw_text) > 50 else raw_text})
                                    },
                                    timeout=10
                                )
                                
                                if post_resp.status_code in [200, 201, 202]:
                                    response_data = post_resp.json()
                                    logger.info(f"Image posted to Miro board - Response: {response_data}")
                                    if 'id' in response_data:
                                        logger.info(f"Image ID on Miro board: {response_data['id']}")
                                    images_added += 1
                                    logger.info(f"Image posted to Miro for shape {shape['id']}")
                                else:
                                    logger.warning(f"Failed to post image for shape {shape['id']}. Status: {post_resp.status_code}. Response: {post_resp.text}")
                        finally:
                            # Clean up temporary file
                            if temp_file and os.path.exists(temp_file.name):
                                os.unlink(temp_file.name)
                    
                except Exception as e:
                    logger.error(f"Error generating image for shape {shape['id']}: {str(e)}")
        else:
            return jsonify({"error": "No content or shape IDs provided"}), 400
            
        # Add timing info
        processing_time = time.time() - start_time
        logger.info(f"Image generation and upload completed in {processing_time:.2f}s")
            
        return jsonify({
            "status": "success", 
            "images_added": images_added,
            "processing_time_seconds": round(processing_time, 2)
        })
            
    except Exception as e:
        logger.error(f"Server error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Server error", "details": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5050))
    logger.info(f"Starting Miro OpenAI API Server on port {port}")
    logger.info(f"Text model: {TEXT_MODEL}, Image model: {IMAGE_MODEL}")
    logger.info(f"CORS origins: {app.config['CORS_ORIGINS'] if 'CORS_ORIGINS' in app.config else 'Default'}")
    app.run(debug=True, port=port, host='0.0.0.0')
