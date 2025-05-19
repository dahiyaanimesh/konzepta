# Miro AI Ideation Assistant

A Miro app integration that helps UX designers and teams generate ideas using AI. The app leverages OpenAI's APIs to generate text suggestions and visual sketches based on sticky notes content.

![AI Ideation Assistant Screenshot](https://example.com/screenshot.png) <!-- Replace with actual screenshot URL when available -->

## Features

- 💡 **Text Idea Generation**: Generate creative ideas and suggestions based on selected sticky notes
- 🎨 **Image Generation**: Create visual sketches and concepts based on text ideas
- 📋 **Board Integration**: Seamlessly adds new ideas to your Miro board
- 🔄 **Semantic Search**: Select specific sticky notes to analyze and expand upon
- 🔍 **Selection Support**: Load all or just selected sticky notes for focused ideation

## Use Cases

- UX Research and Ideation Workshops
- Brainstorming Sessions
- Creative Problem-Solving
- Design Thinking Exercises
- Team Collaboration

## Installation

### Prerequisites

- Node.js (v14 or newer)
- Python 3.8+
- Miro Developer Account
- OpenAI API Key

### Setup Instructions

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/miro-ai-ideation-assistant.git
   cd miro-ai-ideation-assistant
   ```

2. **Install JavaScript dependencies**:
   ```bash
   npm install
   ```

3. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Create environment configuration**:
   - Copy `.env.example` to `.env`
   - Add your OpenAI API key and Miro API token

   ```
   OPENAI_API_KEY=your_openai_api_key
   MIRO_TOKEN=your_miro_developer_token
   ```

5. **Start backend server**:
   ```bash
   python OpenAI_API.py
   ```

6. **Start frontend development server**:
   ```bash
   npm run dev
   ```

7. **Configure Miro App**:
   - Go to [Miro Developer Platform](https://developers.miro.com/)
   - Create a new app
   - Configure app permissions for reading board content and creating content
   - Set the iframe URL to your development server (default: http://localhost:3000)

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your OpenAI API key |
| `MIRO_TOKEN` | Your Miro API token |
| `OPENAI_TEXT_MODEL` | OpenAI model for text generation (default: gpt-4.1) |
| `OPENAI_IMAGE_MODEL` | OpenAI model for image generation (default: gpt-image-1) |

## API Endpoints

The `OpenAI_API.py` file provides several endpoints:

| Endpoint | Description |
|----------|-------------|
| `/generate-ideas` | Generate text ideas based on sticky note content |
| `/generate-image-ideas` | Generate image ideas from selected shapes |
| `/generate-text2image-sketches` | Generate image sketches from text content |

## Usage Instructions

1. Install the app on your Miro board
2. Open the app from the Miro toolbar
3. Select sticky notes on your board
4. Click "Load Selected Sticky" or "Load All Stickies"
5. Click "Generate Text" to create new idea suggestions
6. Click "Generate Images" to create visual concepts
7. Click "Add to Miro Board" to add suggestions to your board

## Technology Stack

- **Frontend**: React.js with Next.js
- **Backend**: Python with Flask
- **AI Services**: OpenAI (GPT-4.1, DALL-E)
- **Integration**: Miro REST API and SDK

## Development

### Folder Structure

```
├── src/                 # Frontend source code
│   ├── components/      # React components
│   └── utils/           # Utility functions
├── OpenAI_API.py        # Backend API server
├── manifest.json        # Miro app manifest
└── .env.example         # Environment variables template
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server

## Deployment

The app can be deployed to Vercel:

```bash
vercel
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create a feature branch 
3. Commit your changes 
4. Push to the branch 
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Miro Developer Platform](https://developers.miro.com/)
- [OpenAI API](https://openai.com/api/)
- [Next.js](https://nextjs.org/) 
