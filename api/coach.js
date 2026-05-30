export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, systemPrompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Convert messages to Gemini format - include system prompt in first message
    const geminiMessages = [];
    
    // Add system prompt as the first user message
    geminiMessages.push({
      role: 'user',
      parts: [{ text: systemPrompt + '\n\n' }]
    });

    // Add actual conversation messages
    messages.forEach(msg => {
      geminiMessages.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    });

    const payload = {
      contents: geminiMessages,
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.7,
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1p1beta1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      console.error('Gemini API error:', responseText);
      return res.status(response.status).json({ 
        error: `Gemini API error: ${responseText}` 
      });
    }

    const data = JSON.parse(responseText);

    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      console.error('Unexpected response structure:', data);
      return res.status(500).json({ error: 'No response from Gemini' });
    }

    const reply = data.candidates[0].content.parts[0].text;
    
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Coach endpoint error:', error);
    return res.status(500).json({ error: error.message });
  }
}
